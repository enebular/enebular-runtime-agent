/* @flow */

import fs from 'fs'
import request from 'request'
import progress from 'request-progress'
import type DeviceStateManager from './device-state-manager'
import type { Logger } from 'winston'
import { delay } from './utils'
import util from 'util'

const moduleName = 'asset-man'

class Asset {
  _type: string
  _log: Logger
  id: string
  updateId: string
  state: string
  //      pending | deploying | deployed | deployFail
  //      removing | removeFail
  pendingChange: string // (deploy|remove)
  changeTs: string
  //  todo:
  //   - failCount

  constructor(
    type: string,
    id: string,
    updateId: string,
    state: string,
    pendingChange: string,
    log: Logger
  ) {
    this._type = type
    this._log = log
    this.id = id
    this.updateId = updateId
    this.state = state
    this.pendingChange = pendingChange
    this.changeTs = Date.now()
  }

  async type() {
    return this._type
  }

  // todo: split deploy into: acquire, verify, install and exec
  // todo: hooks exec

  async deploy(): boolean {
    throw new Error('Called an abstract function')
  }

  async remove(): boolean {
    throw new Error('Called an abstract function')
  }
}

class FileAsset extends Asset {
  _key: string
  _filename: string

  constructor(
    id: string,
    updateId: string,
    state: string,
    pendingChange: string,
    key: string,
    filename: string,
    log: Logger
  ) {
    super('file', id, updateId, state, pendingChange, log)
    this._key = key
    this._filename = filename
  }

  // Override
  async deploy() {
    this._log.debug('Deploying...')
    const onProgress = state => {
      this._log.debug(
        util.format(
          'progress: %f%% @ %fB/s, %fsec',
          state.percent ? state.percent.toPrecision(1) : 0,
          state.speed ? state.speed.toPrecision(1) : 0,
          state.time.elapsed ? state.time.elapsed.toPrecision(1) : 0
        )
      )
    }
    const url = this._key
    const filename = this._filename
    this._log.debug(`Dowloading ${url} to ${filename} ...`)
    await new Promise(function(resolve, reject) {
      progress(request(url), {})
        .on('progress', onProgress)
        .on('error', err => {
          reject(err)
        })
        .on('end', () => {
          resolve()
        })
        .pipe(fs.createWriteStream(filename))
    })
    this._log.debug('Deploy done')
    return true
  }

  // Override
  async remove() {
    await delay(5 * 1000)
    this._log.debug('todo: remove')
    return true
  }
}

// reported states:
//      deployPending | deploying | deployed | deployFail
//      updatePending | updating | update-fail
//      removePending | removing | removeFail

export default class AssetManager {
  _deviceStateMan: DeviceStateManager
  _log: Logger
  _assets: Array<Asset> = []
  _processingAssetState: boolean = false

  constructor(deviceStateMan: DeviceStateManager, log: Logger) {
    this._deviceStateMan = deviceStateMan
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

  _handleDeviceStateChange(params) {
    const { type, path } = params
    if (type !== 'desired' || (path && !path.startsWith('assets'))) {
      return
    }

    const desiredState = this._deviceStateMan.getState('desired', 'assets')
    this._debug(
      'Assets state change: ' + JSON.stringify(desiredState, null, '\t')
    )
    if (!desiredState || !desiredState.assets) {
      return
    }

    // Determine 'deploy' and 'update' assets
    let newAssets = []
    for (const desiredAssetId in desiredState.assets) {
      if (!desiredState.assets.hasOwnProperty(desiredAssetId)) {
        continue
      }
      let desiredAsset = desiredState.assets[desiredAssetId]

      let found = false
      for (let asset of this._assets) {
        if (asset.id === desiredAssetId) {
          if (asset.updateId !== desiredAsset.updateId) {
            asset.updateId = desiredAsset.updateId
            asset.pendingChange = 'deploy'
            asset.changeTs = Date.now()
          }
          found = true
          break
        }
      }

      if (!found) {
        let asset = null
        switch (desiredAsset.type) {
          case 'file':
            asset = new FileAsset(
              desiredAssetId,
              desiredAsset.updateId,
              'pending',
              'deploy',
              desiredAsset.typeConfig.key,
              desiredAsset.typeConfig.filename,
              this._log
            )
            break
          default:
            this._error('Unsupported asset type: ' + desiredAsset.type)
            break
        }
        if (asset) {
          newAssets.push(asset)
        }
      }
    }

    // Determine 'remove' assets
    for (let asset of this._assets) {
      if (!desiredState.assets.hasOwnProperty(asset.id)) {
        asset.pendingChange = 'remove'
        asset.changeTs = Date.now()
      }
    }

    // Append 'added' assets
    this._assets = this._assets.concat(newAssets)

    // this._debug('assets: ' + inspect(this._assets))

    this._updateReportedAssetsState()
    this._processPendingAssets()
  }

  // todo: full 'asset' path set on startup

  _updateReportedAssetState(asset) {
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
    this._deviceStateMan.updateReportedState(
      'set',
      'assets.assets.' + asset.id,
      {
        updateId: asset.updateId,
        ts: asset.changeTs,
        state: state
      }
    )
  }

  _updateReportedAssetsState() {
    for (let asset of this._assets) {
      if (!asset.pendingChange) {
        continue
      }
      this._updateReportedAssetState(asset)
    }
  }

  // Note: this path 'update' approach needs improvement as if
  // an update is missed at some point, its contents will never
  // be sent to agent-man.

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

  _pendingChangeAssetExists(): boolean {
    return this._getFirstPendingChangeAsset() !== null
  }

  async _processPendingAssets() {
    if (this._processingAssetState) {
      return
    }
    this._processingAssetState = true

    while (this._pendingChangeAssetExists()) {
      // Process simple removes
      let removeAssets = []
      for (let asset of this._assets) {
        if (
          asset.pendingChange &&
          asset.pendingChange === 'remove' &&
          asset.state === 'pending'
        ) {
          this._deviceStateMan.updateReportedState(
            'remove',
            'assets.assets.' + asset.id
          )
          removeAssets.push(asset)
        }
      }
      this._assets = this._assets.filter(asset => {
        return !removeAssets.includes(asset)
      })

      let asset = this._getFirstPendingChangeAsset()
      if (!asset) {
        continue
      }

      let pendingChange = asset.pendingChange
      asset.pendingChange = null

      switch (pendingChange) {
        case 'deploy':
          if (asset.state === 'deployed') {
            asset.state = 'removing'
            this._updateReportedAssetState(asset)
            let success = await asset.remove()
            if (!success) {
              asset.state = 'removeFail'
              break
            }
          }
          asset.state = 'deploying'
          this._updateReportedAssetState(asset)
          let success = await asset.deploy()
          asset.state = success ? 'deployed' : 'deployFail'
          this._updateReportedAssetState(asset)
          break

        case 'remove':
          if (asset.state === 'deployed') {
            asset.state = 'removing'
            this._updateReportedAssetState(asset)
            let success = await asset.remove()
            if (!success) {
              asset.state = 'removeFail'
              break
            }
          }
          this._deviceStateMan.updateReportedState(
            'remove',
            'assets.assets.' + asset.id
          )
          this._assets = this._assets.filter(a => {
            return a !== asset
          })
          break

        default:
          this._error('Unsupported pending change: ' + pendingChange)
          break
      }

      await delay(2 * 1000)
    }

    this._processingAssetState = false
  }
}
