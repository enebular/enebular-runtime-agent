/* @flow */
import type { Logger } from 'winston'
import type LogManager from './log-manager'
import EventEmitter from 'events'

const moduleName = 'agent-runner-man'
// TODO: types should be merged into runner/agent-runner-message-type.ts
// once we switched to typescript.
type Request = {
  id: number,
  taskType: string,
  settings: Object
}

type Response = {
  id: number,
  success: boolean,
  errorMsg?: string
}

type Log = {
  level: string,
  msg: string
}

type StatusUpdate = {
  type: string,
  status: Object
}

type Data = {
  type: string,
  body: Request | Response | Log | StatusUpdate
}

export default class AgentRunnerManager extends EventEmitter {
  _taskIndex = 1
  _log: Logger
  _logManager: LogManager
  _runnerLog: Logger
  _requests = {}

  constructor(log: Logger, logManager: LogManager) {
    super()
    process.on('message', data => {
      this._onDataReceived(data)
    })

    this._log = log
    this._logManager = logManager
    this._runnerLog = logManager.addLogger('service.runner', [
      'console',
      'enebular',
      'file',
      'syslog'
    ])
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

  _send(data: Data) {
    if (process.send) {
      process.send(data)
    }
  }

  _sendRequest(
    taskType: string,
    settings: Object,
    callback: (success: boolean, errorMsg?: string) => void
  ) {
    const id = this._taskIndex++
    this._requests[id] = callback
    this._send({
      type: 'request',
      body: {
        id: id,
        taskType: taskType,
        settings: settings
      }
    })
  }

  _request(taskType: string, settings: Object): Promise<void> {
    return new Promise((resolve, reject) => {
      const callback = (success, errorMsg) => {
        if (success) {
          resolve()
        } else reject(new Error(errorMsg))
      }
      this._sendRequest(taskType, settings, callback)
    })
  }

  remoteLoginStatusUpdate() {
    return this._request('remoteLoginStatusUpdate', {})
  }

  remoteLoginSet(settings: Object) {
    return this._request('remoteLogin', settings)
  }

  _onDataReceived(data: Data) {
    if (!data.type) {
      this._error(`data type is not defined, invalid data: ${data}`)
      return
    }
    switch (data.type) {
      case 'log':
        return this._onLogReceived(data.body)
      case 'response':
        return this._onResponseReceived(data.body)
      case 'statusUpdate':
        return this._onStatusUpdateReceived(data.body)
      default:
        this._error(
          'Invalid data: unknown type:',
          JSON.stringify(data, null, 2)
        )
    }
  }

  _onLogReceived(log: Log) {
    if (!log.level) {
      this._error(`log level is required`)
      return
    }
    switch (log.level) {
      case 'info':
        this._runnerLog.info(log.msg)
        return
      case 'error':
        this._runnerLog.error(log.msg)
        return
      case 'debug':
        this._runnerLog.debug(log.msg)
        return
      default:
        this._error(
          'Invalid data: unknown level:',
          JSON.stringify(log, null, 2)
        )
    }
  }

  _onResponseReceived(response: Response) {
    const id = response.id
    if (!id) {
      this._error(`response id is required`)
      return
    }
    const callback = this._requests[id]
    if (!callback) {
      this._error(`cannot found callback for request ${id}`)
      return
    }
    callback(response.success, response.errorMsg)
  }

  _onStatusUpdateReceived(statusUpdate: StatusUpdate) {
    if (!statusUpdate.type) {
      this._error(`statusUpdate type is required`)
      return
    }
    this.emit(statusUpdate.type, statusUpdate.status)
  }
}
