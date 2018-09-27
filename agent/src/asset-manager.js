/* @flow */

import type DeviceStateManager from './device-state-manager'
import type { Logger } from 'winston'

const moduleName = 'asset-man'

//type AssetState = {
//  id: string,
//  updateId: string,
//  state: string
//      pending | deploying | deployed | deploy-fail
//      updating
//      removing | remove-fail
//  pendingChange: string (deploy|update|remove)
//  changeTs
//  todo:
//   - failCount
// }

// reported states:
//      deployPending | deploying | deployed | deploy-fail
//      updatePending | updating | update-fail
//      removePending | removing | remove-fail

export default class AssetManager {
  _deviceStateMan: DeviceStateManager
  _log: Logger
  _assets: Array<{}> = []

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
            asset.pendingChange = 'update'
            asset.changeTs = Date.now()
          }
          found = true
          break
        }
      }

      if (!found) {
        newAssets.push({
          id: desiredAssetId,
          updateId: desiredAsset.updateId,
          state: 'pending',
          pendingChange: 'deploy',
          changeTs: Date.now()
        })
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

    this._debug('assets: ' + JSON.stringify(this._assets, null, '\t'))

    this._updateReportedAssetsState()
    this._processAssetState()
  }

  // todo: full 'asset' path set on startup

  _updateReportedAssetState(asset) {
    let state
    if (asset.pendingChange) {
      switch (asset.pendingChange) {
        case 'deploy':
          state = 'deployPending'
          break
        case 'update':
          state = 'updatePending'
          break
        case 'remove':
          state = 'removePending'
          break
        default:
          state = 'unknown'
          break
      }
    } else {
      state = 'todo'
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

  _processAssetState() {
    if (this._assets.length < 1) {
      return
    }

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

    if (this._assets.length < 1) {
      return
    }

    // todo: all other updates:
    //    - full removes
    //    - deploys
    //    - updates

    this._debug('assets: todo: ensure one is processing')
  }
}
