/* @flow */

import type DeviceStateManager from './device-state-manager'
import type { Logger } from 'winston'

const moduleName = 'asset-man'

//type AssetState = {
//  id: string,
//  updateId: string,
//  state: string
//  pendingChange: string (add|update|remove)
//}

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

    // Determine 'added' and 'updated' assets
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
          pendingChange: 'add'
        })
      }
    }

    // Determine 'removed' assets
    for (let asset of this._assets) {
      if (!desiredState.assets.hasOwnProperty(asset.id)) {
        asset.pendingChange = 'remove'
      }
    }

    // Append 'added' assets
    this._assets = this._assets.concat(newAssets)

    this._debug('assets: ' + JSON.stringify(this._assets, null, '\t'))

    // tmp
    for (let asset of this._assets) {
      if (asset.pendingChange) {
        this._deviceStateMan.updateReportedState(
          'set',
          'assets.assets.' + asset.id,
          asset
        )
      }
    }
  }
}
