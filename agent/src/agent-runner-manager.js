import type { Logger } from 'winston'
import type LogManager from './log-manager'

const moduleName = 'agent-runner-man'
// TODO: types should be merged into runner/agent-runner-message-type.ts
// once we switched to typescript. 
type Data = {
  type: string,
  body: Request | Response | Log | StatusUpdate
}

type Request = {
  id: number,
  type: string,
  settings: Object
}

type Response = {
  id: number,
  success: boolean,
  errorMsg?: string
}

type Log = {
  level: string,
  msg : string
}

type StatusUpdate = {
  type: string,
  status: Object
}

export default class AgentRunnerManager {
  _taskIndex = 1
  _log: Logger
  _logManager: LogManager
  _runnerLog: Logger

  constructor(
    log: Logger,
    logManager: LogManager) {
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

  _sendRequest(request: Request) {
    this._send({
      type: 'request',
      body: request
    })
  }

  remoteLogin(settings: Object) {
    this._sendRequest({
      id: this._taskIndex++,
      type: "remoteLogin",
      settings: settings
    })
  }

  _onDataReceived(data: Data) {
    if (!data.type) {
      this._error(`data type is not defined, invalid data: ${data}`)
      return
    }
    switch(data.type) {
    case 'log':
      return this._onLogReceived(data.body)
    case 'response':
      return this._onResponseReceived(data.body)
    case 'statusUpdate':
      return this._onStatusUpdateReceived(data.body)
    default:
      this._error("Invalid data: unknown type:", JSON.stringify(data, null, 2))
      return
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
      this._error("Invalid data: unknown level:", JSON.stringify(log, null, 2))
      return
    }
  }

  _onResponseReceived(response: Response) {
    this._debug(response)
  }

  _onStatusUpdateReceived(statusUpdate: StatusUpdate) {
    this._debug(statusUpdate)
  }
}

