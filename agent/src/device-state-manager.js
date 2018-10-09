/* @flow */

import EventEmitter from 'events'
import objectPath from 'object-path'
import objectHash from 'object-hash'
import { delay } from './utils'

import type AgentManagerMediator from './agent-manager-mediator'
import type { Logger } from 'winston'

const moduleName = 'device-state-man'

export default class DeviceStateManager extends EventEmitter {
  _agentMan: AgentManagerMediator = null
  _fqDeviceId: string
  _log: Logger
  _desiredState: {} = null
  _reportedState: {} = null
  _statusState: {} = null
  _stateUpdates: Array<{}> = []
  _sendingStateUpdates: boolean = false
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
      case 'reported': // fall-through
      case 'status':
        return true
      default:
        return false
    }
  }

  _isWritableStateType(type): boolean {
    switch (type) {
      case 'reported': // fall-through
      case 'status':
        return true
      case 'desired': // fall-through
      default:
        return false
    }
  }

  _isFunctional() {
    return this._active && this._fqDeviceId
  }

  _stateForTypeExists(type: string): boolean {
    switch (type) {
      case 'desired':
        return this._desiredState !== null
      case 'reported':
        return this._reportedState !== null
      case 'status':
        return this._statusState !== null
      default:
        throw new Error('Unsupported state type: ' + type)
    }
  }

  // returns a copy
  _getStateForType(type: string): {} {
    switch (type) {
      case 'desired':
        return this._desiredState ? Object.assign({}, this._desiredState) : null
      case 'reported':
        return this._reportedState
          ? Object.assign({}, this._reportedState)
          : null
      case 'status':
        return this._statusState ? Object.assign({}, this._statusState) : null
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
      case 'status':
        this._statusState = state
        break
      default:
        throw new Error('Unsupported state type: ' + type)
    }

    this._debug(`Set '${type}' state: ` + JSON.stringify(state, null, '\t'))
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

  async _refreshStatesFromAgentManager(stateTypes: Array<string>) {
    this._debug('Getting states...')
    try {
      const getStates = stateTypes.map(stateType => ({
        type: stateType
        // todo: uId
      }))
      const states = await this._agentMan.getDeviceState(getStates)
      for (let state of states) {
        /**
         * Note that if the state doesn't yet exist then agent-manager will
         * return a successful result, but the state object will just have its
         * type set, and an empty inner state object. It will have no meta.
         *
         * So we only check the validity of the state if it has meta.
         */
        if (state.meta && !this._stateIsValid(state)) {
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
      this._refreshStatesFromAgentManager([type])
    }
  }

  async _sendStateUpdates() {
    if (this._sendingStateUpdates) {
      return
    }
    this._sendingStateUpdates = true

    while (this._stateUpdates.length > 0) {
      let updates = this._stateUpdates
      let updatesLen = updates.length
      this._stateUpdates = []

      this._debug(`Sending ${updatesLen} state updates...`)

      try {
        let requestedUpdates = updates.map(update => ({
          type: update.type,
          op: update.op,
          path: update.path,
          state: update.state
        }))
        const updateResults = await this._agentMan.updateDeviceState(
          requestedUpdates
        )
        const len = updateResults.length
        for (let i = 0; i < len; i++) {
          const updateResult = updateResults[i]
          if (updateResult.success) {
            this._debug(`Update ${i + 1}/${updatesLen} sent successfully`)
            updates.shift()
          } else {
            throw new Error(
              `Update ${i + 1}/${updatesLen} send failed: ` +
                updateResult.message
            )
          }
        }
        await delay(1 * 1000)
      } catch (err) {
        this._error('Failed to send state updates: ' + err.message)
        await delay(5 * 1000)
      }

      this._stateUpdates = updates.concat(this._stateUpdates)
    }

    this._sendingStateUpdates = false
  }

  updateState(type: string, op: string, path: string, state: {}) {
    if (!this._isWritableStateType(type)) {
      throw new Error('Attempted to update unwritable state type: ' + type)
    }
    if (!this._isFunctional() && this._stateForTypeExists(type)) {
      throw new Error('Attempted to update state when not functional')
    }
    // todo: merge in same path updates
    this._stateUpdates.push({
      type: type,
      op: op,
      path: path,
      state: Object.assign({}, state)
    })
    this._sendStateUpdates()
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
      this._refreshStatesFromAgentManager(['desired', 'reported', 'status'])
    }
  }

  setFqDeviceId(fqDeviceId: string) {
    this._fqDeviceId = fqDeviceId
  }
}
