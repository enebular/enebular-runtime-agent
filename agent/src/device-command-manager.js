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

  _isSupportedStateType(type: string): boolean {
    switch (type) {
      case 'req':
        return true
      default:
        return false
    }
  }

  _notifyCommand(op: string, id: string, body: Object) {
    this.emit('command', { op, id, body })
  }

  _handleDeviceCommandSend(params: Object) {
    this._debug('devide command: ' + JSON.stringify(params, null, 2))

    const { type, op, id, body } = params.cmd
    if (!this._isSupportedStateType(type)) {
      this._info('Unsupported state type: ' + type)
      return
    }

    this._notifyCommand(op, id, body)
  }
  
  async sendCommandResponse(
    op: string,
    id: string,
    body: Object
  ) {    
    const resCmd = {
      type: 'res',
      op: op,
      id: id,
      body: body
    }

    await this._connectorMessenger.sendRequest(
      'command/response',
      { cmd: resCmd }
    )
  }
}
