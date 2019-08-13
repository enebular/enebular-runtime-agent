/* @flow */

import EventEmitter from 'events'
import objectPath from 'object-path'
import objectHash from 'object-hash'
import { delay } from './utils'

import type ConnectorMessenger from './connector-messenger'
import type { Logger } from 'winston'
import type Config from './config'

const moduleName = 'device-state-man'

export default class DeviceStateManager extends EventEmitter {
  _connectorMessenger: ConnectorMessenger
  _fqDeviceId: string
  _log: Logger
  _desiredState: ?Object = null
  _reportedState: ?Object = null
  _statusState: ?Object = null
  _stateUpdates: Array<Object> = []
  _sendingStateUpdates: boolean = false
  _active: boolean = false
  _refreshInterval: number
  _refreshIntervalID: number

  constructor(
    connectorMessenger: ConnectorMessenger,
    messageEmitter: EventEmitter,
    config: Config,
    log: Logger
  ) {
    super()
    this._refreshInterval = parseInt(
      config.get('ENEBULAR_DEVICE_STATE_REFRESH_INTERVAL')
    )
    if (isNaN(this._refreshInterval) || this._refreshInterval < 1) {
      throw new Error('Invalid device state refresh interval')
    }
    this._connectorMessenger = connectorMessenger
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

  _isSupportedStateType(type: string): boolean {
    switch (type) {
      case 'desired': // fall-through
      case 'reported': // fall-through
      case 'status':
        return true
      default:
        return false
    }
  }

  _isWritableStateType(type: string): boolean {
    switch (type) {
      case 'reported': // fall-through
      case 'status':
        return true
      case 'desired': // fall-through
      default:
        return false
    }
  }

  _isFunctional(): boolean {
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
  _getStateForType(type: string): ?Object {
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

  _setStateForType(type: string, state: ?Object) {
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

    this._debug(`Set '${type}' state: ` + JSON.stringify(state, null, 2))
  }

  _getMetaHash(state: Object): string {
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

  _stateIsValid(state: ?Object): boolean {
    return state && state.meta && this._getMetaHash(state) === state.meta.hash
  }

  _notifyStateChange(type: string, path: ?string) {
    this.emit('stateChange', { type, path })
  }

  async _refreshStatesFromAgentManager(stateTypes: Array<string>) {
    this._info(`Refreshing states (${stateTypes.join()})...`)
    try {
      // Create request states
      const getStates = stateTypes.map(stateType => {
        let getState = {
          type: stateType
        }
        const currentState = this._getStateForType(stateType)
        if (currentState && currentState.meta) {
          getState.baseUpdateId = currentState.meta.uId
        }
        return getState
      })

      // Get and apply states
      const states = await this._connectorMessenger.sendRequest(
        'deviceState/device/get',
        { states: getStates, ref: true }
      )
      for (let state of states.states) {
        /**
         * Agent-manager will only return state if it's required (i.e the
         * current uId is greater than the baseUpdateId in the request)
         */
        if (state.meta && !state.state) {
          this._info(`No refresh of '${state.type}' state required`)
          continue
        }
        /**
         * Note that if the state doesn't yet exist then agent-manager will
         * return a successful result, but the state object will just have its
         * type set, and an empty inner state object. It will have no meta.
         *
         * So we only check the validity of the state if it has meta.
         */
        if (state.meta && !this._stateIsValid(state)) {
          this._error('Invalid state: ' + JSON.stringify(state, null, 2))
          continue
        }
        this._info(`Refreshed '${state.type}' state`)
        this._setStateForType(state.type, state)
        this._notifyStateChange(state.type)
      }
    } catch (err) {
      this._error('Failed to get device state: ' + err.message)
    }
  }

  _newStateWithChanges(
    type: string,
    op: string,
    path: ?string,
    state: ?Object,
    meta: ?Object,
    extRef: ?Object
  ): Object {
    if (op !== 'set' && op !== 'remove') {
      throw new Error('Unsupported operation type: ' + op)
    }
    if (op === 'set' && state == null) {
      throw new Error('No state provided for set operation')
    }
    let currentState = this._getStateForType(type)
    if (!currentState && op === 'remove') {
      throw new Error('Attempted remove operation with no previous state')
    }

    let newState = {
      type: type,
      meta: meta
    }

    // State
    if (op === 'set') {
      if (path) {
        newState.state = currentState ? currentState.state : {}
        objectPath.set(newState.state, path, state)
      } else {
        newState.state = state
      }
    } else {
      if (path) {
        newState.state = currentState.state
        objectPath.del(newState.state, path)
      } else {
        newState.state = {}
      }
    }

    // Ref
    let newRef = currentState && currentState.ref ? currentState.ref : {}
    // '-' signifies root
    let refPath = path || '-'
    if (meta) {
      let refContent = {
        uId: meta.uId
      }
      if (extRef) {
        refContent['ext'] = extRef
      }
      newRef[refPath] = refContent
    } else {
      if (newRef[refPath]) {
        delete newRef[refPath]
      }
    }
    newState['ref'] = newRef

    return newState
  }

  _handleDeviceStateChange(params: Object) {
    this._debug('State change: ' + JSON.stringify(params, null, 2))

    const { type, op, path, state, meta, extRef } = params

    if (!this._isSupportedStateType(type)) {
      this._info('Unsupported state type: ' + type)
      return
    }

    let newState = null
    try {
      newState = this._newStateWithChanges(type, op, path, state, meta, extRef)
    } catch (err) {
      this._info('Failed to apply state changes: ' + err.message)
    }

    const refreshStates = []

    if (this._stateIsValid(newState)) {
      this._debug('State change applied successfully')
      this._setStateForType(type, newState)
      this._notifyStateChange(type, path)
    } else {
      this._info('Updated state is not valid. Will fully refresh.')
      refreshStates.push(type)
    }

    const possibleStates = ['desired', 'reported', 'status']
    for (let possibleState of possibleStates) {
      if (
        !this._stateForTypeExists(possibleState) &&
        !refreshStates.includes(possibleState)
      ) {
        refreshStates.push(possibleState)
      }
    }

    if (refreshStates.length > 0) {
      this._refreshStatesFromAgentManager(refreshStates)
    }
  }

  async _sendStateUpdates() {
    if (this._sendingStateUpdates) {
      return
    }
    this._sendingStateUpdates = true

    while (this._stateUpdates.length > 0 && this._active) {
      let updates = this._stateUpdates
      let updatesLen = updates.length
      this._stateUpdates = []

      this._debug(`Sending ${updatesLen} state updates...`)

      try {
        let requestedUpdates = updates.map(update => ({
          type: update.type,
          op: update.op,
          path: update.path,
          state: update.state,
          extRef: update.extRef
        }))
        let updateResults = await this._connectorMessenger.sendRequest(
          'deviceState/device/update',
          { updates: requestedUpdates }
        )
        updateResults = updateResults.updates
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
        const pauseSec = 60
        this._info(`Pausing state updates send for ${pauseSec} seconds`)
        await delay(pauseSec * 1000)
      }

      this._stateUpdates = updates.concat(this._stateUpdates)
    }

    this._sendingStateUpdates = false
  }

  canUpdateState(type: string): boolean {
    return this._isFunctional() && this._stateForTypeExists(type)
  }

  updateState(
    type: string,
    op: string,
    path: ?string,
    state: ?Object,
    extRef: ?Object
  ) {
    if (!this._isWritableStateType(type)) {
      throw new Error('Attempted to update unwritable state type: ' + type)
    }
    if (!this.canUpdateState(type)) {
      throw new Error('Attempted to update state when not functional')
    }

    // Apply update (ignoring meta as we're not attempting to maintain it for
    // local changes for the time being)
    let newState
    try {
      newState = this._newStateWithChanges(type, op, path, state, null)
    } catch (err) {
      this._error('Failed to apply state changes: ' + err.message)
      return
    }

    this._setStateForType(type, newState)

    // Push update
    this._stateUpdates.push({
      type: type,
      op: op,
      path: path,
      state: state,
      extRef: extRef
    })
    this._sendStateUpdates()
  }

  getState(type: string, path: string): ?Object {
    const state = this._getStateForType(type)
    if (state && path) {
      return objectPath.get(state.state, path)
    }
    return state
  }

  getRef(type: string, path: string): ?Object {
    const state = this._getStateForType(type)
    if (!state || !state.ref) {
      return null
    }
    if (path) {
      const pathComps = path.split('.')
      while (pathComps.length > 0) {
        const p = pathComps.join('.')
        if (state.ref[p]) {
          return state.ref[p]
        }
        pathComps.pop()
      }
    }
    return state.ref['-']
  }

  activate(active: boolean) {
    if (active === this._active) {
      return
    }
    if (active && !this._fqDeviceId) {
      return
    }

    this._active = active

    clearInterval(this._refreshIntervalID)

    if (this._active) {
      this._refreshStatesFromAgentManager(['desired', 'reported', 'status'])

      this._refreshIntervalID = setInterval(() => {
        this._refreshStatesFromAgentManager(['desired', 'reported', 'status'])
      }, this._refreshInterval * 1000)
    }
  }

  setFqDeviceId(fqDeviceId: string) {
    this._fqDeviceId = fqDeviceId
  }
}
