/* @flow */

import EventEmitter from 'events'
import { delay } from './utils'

import type ConnectorMessenger from './connector-messenger'
import type { Logger } from 'winston'

const moduleName = 'device-command-man'

export default class DeviceCommandManager extends EventEmitter {
  _connectorMessenger: ConnectorMessenger
  _log: Logger

  constructor(
    connectorMessenger: ConnectorMessenger,
    messageEmitter: EventEmitter,
    log: Logger
  ) {
    super()

    this._connectorMessenger = connectorMessenger
    this._log = log
    messageEmitter.on('deviceCommandSend', params =>
      this._handleDeviceCommandSend(params)
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

  _notifyCommand(op: string, body: Object) {
    this.emit('command', { op, body })
  }

  _handleDeviceCommandSend(params: Object) {
    this._debug('devide command: ' + JSON.stringify(params, null, 2))

    const { type, op, id, body } = params.cmd
    // パラメータチェック


    this._notifyCommand(op, body)
  }
/*
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
  */
}
