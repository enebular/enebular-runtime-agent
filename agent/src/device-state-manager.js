/* @flow */

import objectHash from 'object-hash'

import type AgentManagerMediator from './agent-manager-mediator'
import type { Logger } from 'winston'

const moduleName = 'device-state-man'

export default class DeviceStateManager {
  _agentMan: AgentManagerMediator = null
  _fqDeviceId: string
  _log: Logger
  _desiredState = {}
  _reportedState = {}
  _active: boolean = false
  _statesInited: boolean = false

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

  _isSupportedStateType(type): boolean {
    switch (type) {
      case 'desired': // fall-through
      case 'reported':
        return true
      default:
        return false
    }
  }

  _getStateForType(type: string): {} {
    switch (type) {
      case 'desired':
        return this._desiredState
      case 'reported':
        return this._reportedState
      default:
        throw new Error('Unsupported state type: ' + type)
    }
  }

  _setStateForType(type: string, state: {}) {
    switch (type) {
      case 'desired':
        this._desiredState = state
        break
      case 'reported':
        this._reportedState = state
        break
      default:
        throw new Error('Unsupported state type: ' + type)
    }
  }

  _getMetaHash(state): string {
    let hashObj = {
      fqDeviceId: this._fqDeviceId,
      type: state.type,
      state: state.state,
      meta: {
        v: state.meta.v,
        ts: state.meta.ts,
        uId: state.meta.uId,
        pHash: state.meta.pHash
      }
    }
    return objectHash(hashObj, { algorithm: 'sha1', encoding: 'base64' })
  }

  _stateIsValid(state: {}) {
    return this._getMetaHash(state) === state.meta.hash
  }

  async _initStates() {
    this._statesInited = false
    if (!this._fqDeviceId) {
      throw new Error('Attempted to initialize states when fqDeviceId not set')
    }
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
        if (!this._stateIsValid(state)) {
          this._error('Invalid state: ' + JSON.stringify(state, null, '\t'))
          continue
        }
        this._setStateForType(state.type, state)
      }
      this._statesInited = true
      this._debugStates()
      // todo: notify of state init / change
    } catch (err) {
      this._error('Failed to get device state: ' + err.message)
    }
  }

  setReportedState(path: string, state: {}) {
    if (!this._statesInited) {
      this._error('Attempted to set reported state when not yet initialized')
      // return
    }

    // let state = this._getStateForType('reported')
  }

  activate(active: boolean) {
    if (active === this._active) {
      return
    }
    this._active = active
    if (this._active) {
      this._initStates()
    }
  }

  setFqDeviceId(fqDeviceId: string) {
    this._fqDeviceId = fqDeviceId
  }
}
