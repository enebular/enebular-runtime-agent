/* @flow */
import EventEmitter from 'events'
import type { Logger } from 'winston'

const moduleName = 'connector-messenger'

export default class ConnectorMessenger extends EventEmitter {
  _nextId: number = 0
  _requests: Object = {}
  _log: Logger

  constructor(log: Logger) {
    super()
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

  async sendMessage(topic: string, body: Object) {
    const startId = this._nextId
    while (true) {
      this._nextId++
      if (this._nextId > 65535) {
        this._nextId = 0
      }
      if (this._nextId === startId) {
        throw new Error('Failed to find free message ID')
      }
      if (!this._requests.hasOwnProperty(this._nextId)) {
        break
      }
    }

    return new Promise((resolve, reject) => {
      // Set up request tracking
      let request = {
        topic,
        body,
        try: 1,
        resolve,
        reject
      }
      this._requests[this._nextId] = request

      // Request send
      this._debug(`Sending request '${this._nextId}'`)
      this._sendRequest(request, this._nextId)
    })
  }

  _sendRequest(request: Object, id: string) {
    let msg = {
      topic: request.topic,
      id: id,
      body: request.body
    }
    if (request.try !== 1) {
      msg.try = request.try
    }

    request.timeoutId = setTimeout(() => {
      this._handleRequestTimeout(id)
    }, 5 * 1000)

    this.emit('requestConnectorCtrlMessageSend', JSON.stringify(msg))
  }

  _handleRequestTimeout(id: number) {
    if (!this._requests.hasOwnProperty(id)) {
      this._error('Unexpected mesage timeout ID: ' + id)
      return
    }

    let request = this._requests[id]
    request.try++
    if (request.try > 3) {
      this._debug(`Too many retries for request '${id}'`)
      this._requests[id].reject(new Error('Timed out waiting for response'))
      delete this._requests[id]
    } else {
      this._debug(`Retrying request '${id}' (${request.try}/3)`)
      this._sendRequest(request, id)
    }
  }
}
