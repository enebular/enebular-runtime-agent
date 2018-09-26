/* @flow */

import type DeviceStateManager from './device-state-manager'
import type { Logger } from 'winston'

const moduleName = 'asset-man'

export default class AssetManager {
  _deviceStateMan: DeviceStateManager
  _log: Logger

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

    const state = this._deviceStateMan.getState('desired', 'assets')
    this._debug('Assets state change: ' + JSON.stringify(state, null, '\t'))
  }
}
