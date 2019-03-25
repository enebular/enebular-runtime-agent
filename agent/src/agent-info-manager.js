/* @flow */
import ip from 'ip'
import type { Logger } from 'winston'
import { version as agentVer } from '../package.json'
import type DeviceStateManager from './device-state-manager'

const moduleName = 'agent-info-man'

export default class AgentInfoManager {
  _ip: string
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

  async setup() {
    this._ip = ip.address()
    //
  }

  async _handleDeviceStateChange(params: { type: string, path: ?string }) {
    const { type, path } = params
    if (type !== 'status' || (path && !path.startsWith('agent'))) {
      return
    }

    const agentInfo = this._deviceStateMan.getState('status', 'agent')
    this._debug('Current agent info: ' + JSON.stringify(agentInfo, null, '\t'))

    if (
      !agentInfo ||
      agentInfo.v !== agentVer ||
      agentInfo.type !== 'enebular-agent' ||
      agentInfo.ip !== this._ip
    ) {
      this._deviceStateMan.updateState('status', 'set', 'agent', {
        type: 'enebular-agent',
        v: agentVer,
        ip: this._ip
      })
    }
  }
}
