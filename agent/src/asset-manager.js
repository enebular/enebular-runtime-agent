/* @flow */

import fs from 'fs'
import path from 'path'
import objectHash from 'object-hash'
import Asset from './asset'
import FileAsset from './file-asset'
import { delay } from './utils'
import type DeviceStateManager from './device-state-manager'
import type AgentManagerMediator from './agent-manager-mediator'
import type { Logger } from 'winston'
import type Config from './config'

const moduleName = 'asset-man'

/**
 * Asset states:
 *   - notDeployed | deployed
 *   - deploying | deployFail
 *   - removing | removeFail
 *
 * Reported asset states:
 *   - deployPending | deploying | deployed | deployFail
 *   - removePending | removing | removeFail
 */

export default class AssetManager {
  _deviceStateMan: DeviceStateManager
  _agentMan: AgentManagerMediator
  _log: Logger
  _assets: Array<Asset> = []
  _processingChanges: boolean = false
  _inited: boolean = false
  _active: boolean = false
  _dataDir: string
  _stateFilePath: string
  _updateAttemptsMax: number = 3

  constructor(
    deviceStateMan: DeviceStateManager,
    agentMan: AgentManagerMediator,
    config: Config,
    log: Logger
  ) {
    this._dataDir = path.resolve(config.get('ENEBULAR_ASSETS_DATA_PATH'))
    this._stateFilePath = config.get('ENEBULAR_ASSETS_STATE_PATH')
    if (!this._dataDir || !this._stateFilePath) {
      throw new Error('Missing asset-man configuration')
    }

    this._deviceStateMan = deviceStateMan
    this._agentMan = agentMan
    this._log = log

    this._deviceStateMan.on('stateChange', params =>
      this._handleDeviceStateChange(params)
    )
  }

  _debug(msg: string, ...args: Array<mixed>) {
    args.push({ module: moduleName })
    this._log.debug(msg, ...args)
  }

  _info(msg: string, ...args: Array<mixed>) {
    args.push({ module: moduleName })
    this._log.info(msg, ...args)
  }

  _error(msg: string, ...args: Array<mixed>) {
    args.push({ module: moduleName })
    this._log.error(msg, ...args)
  }

  async setup() {
    if (this._inited) {
      return
    }

    this._debug('Asset data path: ' + this._dataDir)
    this._debug('Asset state file path: ' + this._stateFilePath)

    if (!fs.existsSync(this._dataDir)) {
      fs.mkdirSync(this._dataDir)
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

    this._info('Loading asset state: ' + this._stateFilePath)

    const data = fs.readFileSync(this._stateFilePath, 'utf8')
    let serializedAssets = JSON.parse(data)
    for (let serializedAsset of serializedAssets) {
      let asset = this._deserializeAsset(serializedAsset)
      this._assets.push(asset)
    }
  }

  _deserializeAsset(serializedAsset): Asset {
    switch (serializedAsset.type) {
      case 'file':
        break
      default:
        throw new Error('Unsupported asset type: ' + serializedAsset.type)
    }

    let asset = new FileAsset(
      serializedAsset.type,
      serializedAsset.id,
      serializedAsset.updateId,
      serializedAsset.config,
      serializedAsset.state,
      this
    )
    asset.updateAttemptCount = serializedAsset.updateAttemptCount
    asset.lastAttemptedUpdateId = serializedAsset.lastAttemptedUpdateId
    asset.changeTs = serializedAsset.changeTs
    asset.changeErrMsg = serializedAsset.changeErrMsg
    asset.pendingChange = serializedAsset.pendingChange
    asset.pendingUpdateId = serializedAsset.pendingUpdateId
    asset.pendingConfig = serializedAsset.pendingConfig

    return asset
  }

  _saveAssetState() {
    this._debug('Saving asset state...')

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
    this._debug('Asset state: ' + JSON.stringify(serializedAssets, null, 2))
    try {
      fs.writeFileSync(
        this._stateFilePath,
        JSON.stringify(serializedAssets),
        'utf8'
      )
    } catch (err) {
      this._error('Failed to save asset state: ' + err.message)
    }
  }

  async _handleDeviceStateChange(params) {
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

    // this._debug('Assets state change: ' + JSON.stringify(desiredState, null, 2))

    const desiredAssets = desiredState.assets ? desiredState.assets : {}

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
              asset.pendingUpdateId !== desiredAsset.updateId)
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
              null,
              null,
              'notDeployed',
              this
            )
            asset.setPendingChange(
              'deploy',
              desiredAsset.updateId,
              desiredAsset.config
            )
            break
          default:
            this._error('Unsupported asset type: ' + desiredAsset.config.type)
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

    // this._debug('assets: ' + inspect(this._assets))

    this._updateAssetsReportedState()
    this._processPendingChanges()
  }

  _removeAssetReportedState(assetId) {
    const reportedState = this._deviceStateMan.getState('reported', 'assets')
    if (!reportedState) {
      return
    }

    this._debug(`Removing asset '${assetId}' reported state`)
    this._deviceStateMan.updateState(
      'reported',
      'remove',
      'assets.assets.' + assetId
    )
  }

  _getReportedAssetState(assetId: string): {} {
    const reportedState = this._deviceStateMan.getState('reported', 'assets')
    if (!reportedState || !reportedState.assets) {
      return null
    }

    return reportedState.assets[assetId]
  }

  // Only updates the reported state if required (if there is a difference)
  _updateAssetReportedState(asset) {
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
    newStateObj.updateId =
      asset.state === 'notDeployed' ? asset.pendingUpdateId : asset.updateId

    // Compare with currently reported state
    const currentStateObj = this._getReportedAssetState(asset.id())
    if (
      currentStateObj &&
      objectHash(currentStateObj) === objectHash(newStateObj)
    ) {
      this._debug(`Update of asset '${asset.id()}' reported state not required`)
      return
    }

    // Update if required
    this._debug(`Updating asset '${asset.id()}' reported state...`)
    // this._debug('Current state: ' + util.inspect(currentStateObj))
    // this._debug('New state: ' + util.inspect(newStateObj))
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

    this._debug(
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

  _getFirstPendingChangeAsset(): Asset {
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

      let pendingChange = asset.pendingChange
      let pendingUpdateId = asset.pendingUpdateId
      let pendingConfig = asset.pendingConfig
      asset.pendingChange = null
      asset.pendingUpdateId = null
      asset.pendingConfig = null
      if (pendingUpdateId !== asset.lastAttemptedUpdateId) {
        asset.lastAttemptedUpdateId = pendingUpdateId
        asset.updateAttemptCount = 0
      }

      switch (pendingChange) {
        case 'deploy':
          const prevState = asset.state
          const prevConfig = asset.config
          const prevUpdateId = asset.updateId
          if (asset.state === 'deployed' || asset.state === 'deployFail') {
            asset.setState('removing')
            this._updateAssetReportedState(asset)
            let success = await asset.remove()
            if (!success) {
              this._error('Remove failed, but contining with deploy...')
              asset.setState('removeFail')
              this._updateAssetReportedState(asset)
            }
          }
          asset.updateId = pendingUpdateId
          asset.config = pendingConfig
          asset.updateAttemptCount++
          asset.setState('deploying')
          this._updateAssetReportedState(asset)
          let success = await asset.deploy()
          if (!success) {
            if (asset.updateAttemptCount < this._updateAttemptsMax) {
              if (asset.pendingChange === null) {
                this._info(
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
                this._info('Deploy failed, but new change already pending.')
              }
              asset.updateId = prevUpdateId
              asset.config = prevConfig
              asset.setState(prevState)
              this._updateAssetReportedState(asset)
              break
            } else {
              this._info(
                `Deploy failed maximum number of times (${
                  asset.updateAttemptCount
                })`
              )
            }
          }
          asset.setState(success ? 'deployed' : 'deployFail')
          this._updateAssetReportedState(asset)
          break

        case 'remove':
          if (asset.state === 'deployed' || asset.state === 'deployFail') {
            asset.setState('removing')
            this._updateAssetReportedState(asset)
            let success = await asset.remove()
            if (!success) {
              asset.setState('removeFail')
              this._updateAssetReportedState(asset)
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
          this._error('Unsupported pending change: ' + pendingChange)
          break
      }

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
