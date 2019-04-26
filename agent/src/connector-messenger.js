/* @flow */
import EventEmitter from 'events'
import type { Logger } from 'winston'
import ConnectorService from './connector-service'

const moduleName = 'connector-messenger'

export default class ConnectorMessenger extends EventEmitter {
  _connector: Logger
  _log: Logger
  _requestTryMax = 3
  _requestTryTimeout = 30 * 1000
  _requests: Object = {}
  _nextId: number = 0

  constructor(connector: ConnectorService, log: Logger) {
    super()
    this._connector = connector
    this._log = log
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

  async sendRequest(topic: string, body: Object) {
    if (!this._connector.connected) {
      this._debug('Attempted to send request when connector not connected')
      return
    }

    const startId = this._nextId
    while (true) {
      this._nextId++
      if (this._nextId > 65535) {
        this._nextId = 0
      }
      if (this._nextId === startId) {
        throw new Error('Failed to find free message ID')
      }
      if (!this._requests.hasOwnProperty(this._nextId.toString())) {
        break
      }
    }
    const id = this._nextId.toString()

    return new Promise((resolve, reject) => {
      // Set up request tracking
      let request = {
        topic,
        body,
        try: 1,
        resolve,
        reject
      }
      this._requests[id] = request

      // Request send
      this._debug(`Sending request '${id}'`)
      this._sendRequestMessage(request, id)
    })
  }

  _sendRequestMessage(request: Object, id: string) {
    let msg = {
      type: 'req',
      id: id,
      topic: request.topic,
      body: request.body
    }
    if (request.try !== 1) {
      msg.try = request.try
    }

    request.timeoutId = setTimeout(() => {
      this._handleRequestTimeout(id)
    }, this._requestTryTimeout)

    this.emit('requestConnectorCtrlMessageSend', msg)
  }

  _handleRequestTimeout(id: string) {
    if (!this._requests.hasOwnProperty(id)) {
      this._error('Unexpected message timeout ID: ' + id)
      return
    }

    let request = this._requests[id]
    request.try++
    if (request.try > this._requestTryMax) {
      this._debug(`Too many retries for request '${id}'`)
      request.reject(new Error('Timed out waiting for response'))
      delete this._requests[id]
    } else {
      this._debug(
        `Retrying request '${id}' (${request.try}/${this._requestTryMax})`
      )
      this._sendRequestMessage(request, id)
    }
  }

  _handleResponseMessage(message: Object) {
    this._debug(`Received response '${message.id}'`)

    if (!this._requests.hasOwnProperty(message.id)) {
      this._info(`Received unexpected response message '${message.id}'`)
      return
    }

    if (message.try) {
      this._info(`Received response message on try ${message.try}`)
    }

    let request = this._requests[message.id]
    clearTimeout(request.timeoutId)
    if (message.res === 'ok') {
      request.resolve(message.body)
    } else {
      let errMsg = 'Error response'
      if (message.body && message.body.message) {
        errMsg += `: ${message.body.message}`
      }
      request.reject(new Error(errMsg))
    }
    delete this._requests[message.id]
  }

  handleReceivedMessage(message: Object) {
    // this._debug('Received message: ' + JSON.stringify(message, null, 2))
    if (message.type !== 'res') {
      this._info(`Received unsupported message type '${message.type}'`)
      return
    }
    this._handleResponseMessage(message)
  }
}
