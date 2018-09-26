/* @flow */

import EventEmitter from 'events'
import objectPath from 'object-path'
import objectHash from 'object-hash'

import type AgentManagerMediator from './agent-manager-mediator'
import type { Logger } from 'winston'

const moduleName = 'device-state-man'

export default class DeviceStateManager extends EventEmitter {
  _agentMan: AgentManagerMediator = null
  _fqDeviceId: string
  _log: Logger
  _desiredState: {} = null
  _reportedState: {} = null
  _active: boolean = false

  constructor(
    agentMan: AgentManagerMediator,
    messageEmitter: EventEmitter,
    log: Logger
  ) {
    super()
    this._agentMan = agentMan
    this._log = log
    messageEmitter.on('deviceStateChange', params =>
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
        return this._desiredState ? Object.assign({}, this._desiredState) : null
      case 'reported':
        return this._reportedState
          ? Object.assign({}, this._reportedState)
          : null
      default:
        throw new Error('Unsupported state type: ' + type)
    }
  }

  _setStateForType(type: string, state: {}) {
    switch (type) {
      case 'desired':
        this._desiredState = state
        this._debug(
          'Desired state: ' + JSON.stringify(this._desiredState, null, '\t')
        )
        break
      case 'reported':
        this._reportedState = state
        this._debug(
          'Reported state: ' + JSON.stringify(this._reportedState, null, '\t')
        )
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

  _notifyStateChange(type: string, path: string) {
    this.emit('stateChange', { type, path })
  }

  async _updateStatesFromAgentManager(stateTypes: Array<string>) {
    if (!this._fqDeviceId) {
      throw new Error('Attempted to initialize states when fqDeviceId not set')
    }
    this._debug('Getting states...')
    try {
      const getStates = stateTypes.map(stateType => ({
        type: stateType
        // todo: uId
      }))
      const states = await this._agentMan.getDeviceState(getStates)
      for (let state of states) {
        if (!this._stateIsValid(state)) {
          this._error('Invalid state: ' + JSON.stringify(state, null, '\t'))
          continue
        }
        this._setStateForType(state.type, state)
        this._notifyStateChange(state.type)
      }
    } catch (err) {
      this._error('Failed to get device state: ' + err.message)
    }
  }

  _handleDeviceStateChange(params) {
    this._debug('State change: ' + JSON.stringify(params, null, '\t'))

    const { type, op, path, state, meta } = params

    if (!this._isSupportedStateType(type)) {
      this._info('Unsupported state type: ' + type)
      return
    }
    if (op !== 'set' && op !== 'remove') {
      this._info('Unsupported operation type: ' + op)
      return
    }
    if (op === 'set' && !state) {
      this._info('No state provided for set operation')
      return
    }

    let currentState = this._getStateForType(type)
    if (!currentState && op === 'remove') {
      this._info('Attempted remove operation with no previous state')
      return
    }

    // Determine new state
    let newState = {
      type: type,
      meta: meta
    }
    if (op === 'set') {
      if (path && path.length > 0) {
        newState.state = currentState ? currentState.state : {}
        objectPath.set(newState.state, path, state)
      } else {
        newState.state = state
      }
    } else {
      if (path && path.length > 0) {
        newState.state = currentState.state
        objectPath.del(newState.state, path)
      } else {
        newState.state = {}
      }
    }

    if (this._stateIsValid(newState)) {
      this._debug('State change applied successfully')
      this._setStateForType(type, newState)
      this._notifyStateChange(type, path)
    } else {
      this._info('Updated state is not valid. Will fully refresh.')
      this._updateStatesFromAgentManager([type])
    }
  }

  setReportedState(path: string, state: {}) {
    // let state = this._getStateForType('reported')
  }

  getState(type: string, path: string) {
    const state = this._getStateForType(type)
    if (state && path) {
      return objectPath.get(state.state, path)
    }
    return state
  }

  activate(active: boolean) {
    if (active === this._active) {
      return
    }
    this._active = active
    if (this._active) {
      this._updateStatesFromAgentManager(['desired', 'reported'])
    }
  }

  setFqDeviceId(fqDeviceId: string) {
    this._fqDeviceId = fqDeviceId
  }
}
