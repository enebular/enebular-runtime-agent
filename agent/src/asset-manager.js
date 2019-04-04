/* @flow */

import fs from 'fs'
import mkdirp from 'mkdirp'
import objectHash from 'object-hash'
import path from 'path'
import type { Logger } from 'winston'
import AiModel from './ai-model'
import Asset from './asset'
import FileAsset from './file-asset'
import { delay } from './utils'
import type DeviceStateManager from './device-state-manager'
import type DockerManager from './docker-manager'
import type PortManager from './port-manager'
import type AgentManagerMediator from './agent-manager-mediator'
import type Config from './config'

const moduleName = 'asset-man'

/**
 * Asset 'State' Management and Representation
 *
 * The state of a single asset is chiefly managed through two properties:
 *
 *   - Its current acutal state (asset.state)
 *   - Its current pending change (asset.pendingChange)
 *
 * On top of that, those two properties are then combined into a single overall
 * current 'state' for use in the 'reported' device state.
 *
 * An asset's configuration details are maintained in the following two
 * properties:
 *
 *   - Its current config (asset.config)
 *   - Its pending config (asset.pendingConfig)
 *
 * The asset 'current actual' states are:
 *
 *   - notDeployed - Asset is not deployed (is new / never been deployed before)
 *   - deployed -  Asset is fully / successfully deployed
 *   - deploying -  Asset is being deployed
 *   - deployFail -  Asset deploy failed
 *   - removing -  Asset is being removed
 *   - removeFail - Asset remove failed
 *
 * Note that the initial state of a newly added (deployed for the first time)
 * asset will be 'notDeployed'. However, on removal, after the asset has been
 * successfully removed it is just cleared from the state completely, and so
 * doesn't go back to the 'notDeployed' state.
 *
 * The asset 'pending change' types are:
 *
 *   - deploy - Asset will be (re)deployed
 *   - remove - Asset will be removed
 *
 * The overall 'combined' asset states (as used in 'reported') are:
 *
 *   - deployPending - Asset will be (re)deployed
 *     - config: Current config if asset.state is not 'notDeployed'
 *     - pendingConfig: Config to be deployed
 *     - config in 'reported': if asset.state is 'notDeployed' it is
 *       pendingConfig, otherwise it is config.
 *
 *   - deploying - Asset is being deployed
 *     - config: Config being deployed
 *     - pendingConfig: null
 *     - config in 'reported': config
 *
 *   - deployed - Asset is fully / successfully deployed
 *     - config: Config deployed
 *     - pendingConfig: null
 *     - config in 'reported': config
 *
 *   - deployFail - Asset deploy failed
 *     - config: Config for the deploy that failed
 *     - pendingConfig: null
 *     - config in 'reported': config
 *
 *   - removePending - Asset will be removed
 *     - config: Config deployed
 *     - pendingConfig: null
 *     - config in 'reported': config
 *
 *   - removing - Asset is being removed
 *     - config: Config deployed
 *     - pendingConfig: null
 *     - config in 'reported': config
 *
 *   - removeFail - Asset remove failed
 *     - config: Config deployed (before remove failure)
 *     - pendingConfig: null
 *     - config in 'reported': config
 */

export default class AssetManager {
  _deviceStateMan: DeviceStateManager
  _dockerMan: DockerManager
  _portMan: PortManager
  _log: Logger
  _assets: Array<Asset> = []
  _processingChanges: boolean = false
  _inited: boolean = false
  _active: boolean = false
  _dataDir: string
  _aiModelDir: string
  _stateFilePath: string
  _updateAttemptsMax: number = 3
  agentMan: AgentManagerMediator

  constructor(
    deviceStateMan: DeviceStateManager,
    dockerMan: DockerManager,
    agentMan: AgentManagerMediator,
    portMan: PortManager,
    config: Config,
    log: Logger
  ) {
    this._dataDir = path.resolve(config.get('ENEBULAR_ASSETS_DATA_PATH'))
    this._aiModelDir = path.resolve(config.get('ENEBULAR_AI_MODELS_DATA_PATH'))
    this._stateFilePath = config.get('ENEBULAR_ASSETS_STATE_PATH')
    if (!this._dataDir || !this._aiModelDir || !this._stateFilePath) {
      throw new Error('Missing asset-man configuration')
    }

    this._deviceStateMan = deviceStateMan
    this._dockerMan = dockerMan
    this._portMan = portMan
    this.agentMan = agentMan
    this._log = log

    this._deviceStateMan.on('stateChange', params =>
      this._handleDeviceStateChange(params)
    )
  }

  dataDir(): string {
    return this._dataDir
  }

  aiModelDir(): string {
    return this._aiModelDir
  }

  debug(msg: string, ...args: Array<mixed>) {
    args.push({ module: moduleName })
    this._log.debug(msg, ...args)
  }

  info(msg: string, ...args: Array<mixed>) {
    args.push({ module: moduleName })
    this._log.info(msg, ...args)
  }

  error(msg: string, ...args: Array<mixed>) {
    args.push({ module: moduleName })
    this._log.error(msg, ...args)
  }

  async setup() {
    if (this._inited) {
      return
    }

    this.debug('Asset data path: ' + this._dataDir)
    this.debug('Asset state file path: ' + this._stateFilePath)

    if (!fs.existsSync(this._dataDir)) {
      mkdirp.sync(this._dataDir)
    }

    await this._initAssets()

    this._inited = true
  }

  async _initAssets() {
    this._loadAssets()
    this._updateAssetsFromDesiredState()
    this._updateAssetsReportedState()
  }

  _loadAssets() {
    if (!fs.existsSync(this._stateFilePath)) {
      return
    }

    this.info('Loading asset state: ' + this._stateFilePath)

    const data = fs.readFileSync(this._stateFilePath, 'utf8')
    let serializedAssets = JSON.parse(data)
    for (let serializedAsset of serializedAssets) {
      let asset = this._deserializeAsset(serializedAsset)
      this._assets.push(asset)
    }
  }

  _deserializeAsset(serializedAsset: Object): Asset {
    let asset
    switch (serializedAsset.type) {
      case 'file':
        asset = new FileAsset(serializedAsset.type, serializedAsset.id, this)
        break
      case 'ai':
        asset = new AiModel(serializedAsset.type, serializedAsset.id, this)
        break
      default:
        throw new Error('Unsupported asset type: ' + serializedAsset.type)
    }

    asset.updateId = serializedAsset.updateId
    asset.config = serializedAsset.config
    asset.state = serializedAsset.state
    asset.changeTs = serializedAsset.changeTs
    asset.changeErrMsg = serializedAsset.changeErrMsg
    asset.pendingChange = serializedAsset.pendingChange
    asset.pendingUpdateId = serializedAsset.pendingUpdateId
    asset.pendingConfig = serializedAsset.pendingConfig
    asset.updateAttemptCount = serializedAsset.updateAttemptCount
    asset.lastAttemptedUpdateId = serializedAsset.lastAttemptedUpdateId

    return asset
  }

  _saveAssetState() {
    this.debug('Saving asset state...')

    let serializedAssets = []
    for (let asset of this._assets) {
      switch (asset.state) {
        case 'notDeployed':
        case 'deployed':
        case 'deployFail':
        case 'removeFail':
          serializedAssets.push(asset.serialize())
          break
        default:
          break
      }
    }
    this.debug('Asset state: ' + JSON.stringify(serializedAssets, null, 2))
    try {
      fs.writeFileSync(
        this._stateFilePath,
        JSON.stringify(serializedAssets),
        'utf8'
      )
    } catch (err) {
      this.error('Failed to save asset state: ' + err.message)
    }
  }

  async _handleDeviceStateChange(params: { type: string, path: ?string }) {
    if (!this._inited) {
      return
    }

    if (params.path && !params.path.startsWith('assets')) {
      return
    }

    switch (params.type) {
      case 'desired':
        this._updateAssetsFromDesiredState()
        break
      case 'reported':
        this._updateAssetsReportedState()
        break
      default:
        break
    }
  }

  async _updateAssetsFromDesiredState() {
    const desiredState = this._deviceStateMan.getState('desired', 'assets')
    if (!desiredState) {
      return
    }

    // this.debug('Assets state change: ' + JSON.stringify(desiredState, null, 2))

    const desiredAssets = desiredState.assets || {}

    // Determine assets requiring a 'deploy' change
    let newAssets = []
    for (const desiredAssetId in desiredAssets) {
      if (!desiredAssets.hasOwnProperty(desiredAssetId)) {
        continue
      }
      let desiredAsset = desiredAssets[desiredAssetId]

      // Updates to existing assets
      let found = false
      for (let asset of this._assets) {
        if (asset.id() === desiredAssetId) {
          if (
            (!asset.pendingChange &&
              asset.updateId !== desiredAsset.updateId) ||
            (asset.pendingChange === 'deploy' &&
              asset.pendingUpdateId !== desiredAsset.updateId) ||
            asset.pendingChange === 'remove'
          ) {
            asset.setPendingChange(
              'deploy',
              desiredAsset.updateId,
              desiredAsset.config
            )
          }
          found = true
          break
        }
      }

      // New assets
      if (!found) {
        let asset = null
        switch (desiredAsset.config.type) {
          case 'file':
            asset = new FileAsset(
              desiredAsset.config.type,
              desiredAssetId,
              this
            )
            asset.state = 'notDeployed'
            asset.setPendingChange(
              'deploy',
              desiredAsset.updateId,
              desiredAsset.config
            )
            break
          case 'ai':
            asset = new AiModel(desiredAsset.config.type, desiredAssetId, this)
            asset.state = 'notDeployed'
            asset.setPendingChange(
              'deploy',
              desiredAsset.updateId,
              desiredAsset.config
            )
            break
          default:
            this.error('Unsupported asset type: ' + desiredAsset.config.type)
            break
        }
        if (asset) {
          newAssets.push(asset)
        }
      }
    }

    // Determine assets requiring a 'remove change
    for (let asset of this._assets) {
      if (!desiredAssets.hasOwnProperty(asset.id())) {
        asset.setPendingChange('remove', null, null)
      }
    }

    // Append 'new' assets
    this._assets = this._assets.concat(newAssets)

    // this.debug('assets: ' + inspect(this._assets))

    this._updateAssetsReportedState()
    this._processPendingChanges()
  }

  _removeAssetReportedState(assetId: string) {
    if (!this._deviceStateMan.canUpdateState('reported')) {
      return
    }

    this.debug(`Removing asset '${assetId}' reported state`)
    this._deviceStateMan.updateState(
      'reported',
      'remove',
      'assets.assets.' + assetId
    )
  }

  _getReportedAssetState(assetId: string): ?Object {
    const reportedState = this._deviceStateMan.getState('reported', 'assets')
    if (!reportedState || !reportedState.assets) {
      return null
    }

    return reportedState.assets[assetId]
  }

  // Only updates the reported state if required (if there is a difference)
  _updateAssetReportedState(asset: Asset) {
    if (!this._deviceStateMan.canUpdateState('reported')) {
      return
    }

    // Create new reported state
    let state
    if (asset.pendingChange) {
      switch (asset.pendingChange) {
        case 'deploy':
          state = 'deployPending'
          break
        case 'remove':
          state = 'removePending'
          break
        default:
          state = 'unknown'
          break
      }
    } else {
      state = asset.state
    }
    let newStateObj = {
      ts: asset.changeTs,
      state: state
    }
    if (asset.changeErrMsg) {
      newStateObj.message = asset.changeErrMsg
    }
    if (asset.pendingChange) {
      newStateObj.pendingUpdateId = asset.pendingUpdateId
    }
    if (state === 'deploying') {
      newStateObj.updateAttemptCount = asset.updateAttemptCount
    }
    if (asset.config) {
      newStateObj.config = asset.config
    } else if (asset.state === 'notDeployed' && asset.pendingConfig) {
      newStateObj.config = asset.pendingConfig
    }
    newStateObj.updateId =
      asset.state === 'notDeployed' ? asset.pendingUpdateId : asset.updateId

    // Compare with currently reported state
    const currentStateObj = this._getReportedAssetState(asset.id())
    if (
      currentStateObj &&
      objectHash(currentStateObj) === objectHash(newStateObj)
    ) {
      this.debug(`Update of asset '${asset.id()}' reported state not required`)
      return
    }

    // Update if required
    this.debug(`Updating asset '${asset.id()}' reported state...`)
    // this.debug('Current state: ' + util.inspect(currentStateObj))
    // this.debug('New state: ' + util.inspect(newStateObj))
    this._deviceStateMan.updateState(
      'reported',
      'set',
      'assets.assets.' + asset.id(),
      newStateObj
    )
  }

  _updateAssetsReportedState() {
    const reportedState = this._deviceStateMan.getState('reported', 'assets')
    if (!reportedState) {
      return
    }

    this.debug(
      'Assets reported state: ' + JSON.stringify(reportedState, null, 2)
    )

    if (reportedState.assets) {
      // Remove reported assets that no longer exist
      for (const reportedAssetId in reportedState.assets) {
        if (!reportedState.assets.hasOwnProperty(reportedAssetId)) {
          continue
        }
        let found = false
        for (let asset of this._assets) {
          if (asset.id() === reportedAssetId) {
            found = true
            break
          }
        }
        if (!found) {
          this._removeAssetReportedState(reportedAssetId)
        }
      }
    }

    // Update all current assets (if required)
    for (let asset of this._assets) {
      this._updateAssetReportedState(asset)
    }
  }

  _getFirstPendingChangeAsset(): ?Asset {
    if (this._assets.length < 1) {
      return null
    }
    for (let asset of this._assets) {
      if (asset.pendingChange) {
        return asset
      }
    }
    return null
  }

  _setAssetState(asset: Asset, state: string) {
    asset.setState(state)
    this._updateAssetReportedState(asset)
  }

  async _processPendingChanges() {
    if (this._processingChanges) {
      return
    }
    this._processingChanges = true

    while (this._active) {
      let asset = this._getFirstPendingChangeAsset()
      if (!asset) {
        break
      }

      // Dequeue the pending change
      let pendingChange = asset.pendingChange
      let pendingUpdateId = asset.pendingUpdateId
      let pendingConfig = asset.pendingConfig
      asset.pendingChange = null
      asset.pendingUpdateId = null
      asset.pendingConfig = null

      // Reset update attempt count if this is a different update
      if (pendingUpdateId !== asset.lastAttemptedUpdateId) {
        asset.lastAttemptedUpdateId = pendingUpdateId
        asset.updateAttemptCount = 0
      }

      // Process the change
      switch (pendingChange) {
        case 'deploy':
          // Save current state so we can revert back to it if required
          const prevState = asset.state
          const prevConfig = asset.config
          const prevUpdateId = asset.updateId

          // Remove if already deployed (or deployFail)
          if (asset.state === 'deployed' || asset.state === 'deployFail') {
            this._setAssetState(asset, 'removing')
            let success = await asset.remove()
            if (!success) {
              this.info('Remove failed, but continuing with deploy...')
              this._setAssetState(asset, 'removeFail')
            }
          }

          // Apply the update and attempt deploy
          asset.updateId = pendingUpdateId
          asset.config = pendingConfig
          asset.updateAttemptCount++
          this._setAssetState(asset, 'deploying')
          let success = await asset.deploy()
          if (!success) {
            if (asset.updateAttemptCount < this._updateAttemptsMax) {
              if (asset.pendingChange === null) {
                this.info(
                  `Deploy failed, but will retry (${asset.updateAttemptCount}/${
                    this._updateAttemptsMax
                  }).`
                )
                asset.setPendingChange(
                  pendingChange,
                  pendingUpdateId,
                  pendingConfig
                )
              } else {
                this.info('Deploy failed, but new change already pending.')
              }
              asset.updateId = prevUpdateId
              asset.config = prevConfig
              // Note that setting it back to prevConfig may be a lie as it may
              // have been 'removed', but it's ok for now to keep things simple.
              this._setAssetState(asset, prevState)
            } else {
              this.info(
                `Deploy failed maximum number of times (${
                  asset.updateAttemptCount
                })`
              )
              this._setAssetState(asset, 'deployFail')
            }
          } else {
            this._setAssetState(asset, 'deployed')
          }
          break

        case 'remove':
          if (asset.state === 'deployed' || asset.state === 'deployFail') {
            this._setAssetState(asset, 'removing')
            let success = await asset.remove()
            if (!success) {
              this._setAssetState(asset, 'removeFail')
              break
            }
          }
          this._removeAssetReportedState(asset.id())
          // The asset may have received a new pendingChange again while we were
          // await'ing, so check for that before we really remove it.
          if (!asset.pendingChange) {
            this._assets = this._assets.filter(a => {
              return a !== asset
            })
          }
          break

        default:
          this.error('Unsupported pending change: ' + pendingChange)
          break
      }

      // Save the changed state
      this._saveAssetState()

      // A small delay to guard against becoming a heavy duty busy loop
      await delay(1 * 1000)
    }

    this._processingChanges = false
  }

  activate(active: boolean) {
    if (active === this._active) {
      return
    }
    if (active && !this._inited) {
      throw new Error('Attempted to activate asset-man when not initialized')
    }
    this._active = active
    if (this._active) {
      this._processPendingChanges()
    }
  }
}
