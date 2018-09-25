/* @flow */

import type AgentManagerMediator from './agent-manager-mediator'
import type { Logger } from 'winston'

const moduleName = 'device-state-man'

export default class DeviceStateManager {
  _agentMan: AgentManagerMediator = null
  _log: Logger
  _desiredState = {}
  _reportedState = {}
  _active: boolean = false

  constructor(agentMan: AgentManagerMediator, log: Logger) {
    this._agentMan = agentMan
    this._log = log
  }

  _debug(msg: string, ...args: Array<mixed>) {
    args.push({ module: moduleName })
    this._log.debug(msg, ...args)
  }

  _error(msg: string, ...args: Array<mixed>) {
    args.push({ module: moduleName })
    this._log.error(msg, ...args)
  }

  _debugStates() {
    this._debug(
      'Desired state: ' + JSON.stringify(this._desiredState, null, '\t')
    )
    this._debug(
      'Reported state: ' + JSON.stringify(this._reportedState, null, '\t')
    )
  }

  async _getStates() {
    this._debug('Getting states...')
    try {
      const getStates = [
        {
          type: 'desired'
          // todo: uId
        },
        {
          type: 'reported'
          // todo: uId
        }
      ]
      const states = await this._agentMan.getDeviceState(getStates)
      for (let state of states) {
        if (state.type === 'desired') {
          this._desiredState = state
        } else if (state.type === 'reported') {
          this._reportedState = state
        } else {
          this._error('Unknown state type: ' + state.type)
        }
      }
      this._debugStates()
    } catch (err) {
      this._error('Failed to get device state: ' + err.message)
    }
  }

  activate(active: boolean) {
    if (active === this._active) {
      return
    }
    this._active = active
    if (this._active) {
      this._getStates()
    }
  }

  // d
}
