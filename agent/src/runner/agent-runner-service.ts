import Task from './task'
import AgentCoreManager from './agent-core-manager'
import AgentRunnerLogger from './agent-runner-logger'
import { SSH } from './ssh'
import { Data, Request } from './agent-runner-message-type'
import TaskRemoteLogin from './task-remote-login'
import TaskRemoteLoginStatusUpdate from './task-remote-login-status-update'
import TaskRotatePublicKey from './task-rotate-public-key'
import TaskError from './task-error'

interface RunningTasks {
  [index: string]: Promise<void>
}

export default class AgentRunnerService {
  private _agentCoreManager: AgentCoreManager
  private _log: AgentRunnerLogger
  private _runningTasks: RunningTasks = {}
  private _taskIndex = 0
  private _ssh: SSH

  public constructor(
    agentCoreManager: AgentCoreManager,
    log: AgentRunnerLogger
  ) {
    this._agentCoreManager = agentCoreManager
    this._agentCoreManager.on('dataReceived', data =>
      this.onDataReceived(data)
    )
    this._log = log
    this._ssh = new SSH(this._log)
    this._ssh.on('clientStatusChanged', active => {
      this._agentCoreManager.sendStatusUpdate({
        type: 'sshClientStatusChanged',
        status: {
          active: active
        }
      })
    })
    this._ssh.on('serverStatusChanged', active => {
      this._agentCoreManager.sendStatusUpdate({
        type: 'sshServerStatusChanged',
        status: {
          active: active
        }
      })
    })
    this._ssh.init()
  }

  get log(): AgentRunnerLogger {
    return this._log
  }

  get ssh(): SSH {
    return this._ssh
  }

  private _debug(...args: any[]): void {
    this._log.debug(...args)
  }

  private _info(...args: any[]): void {
    this._log.info(...args)
  }

  private _error(...args: any[]): void {
    this._log.error(...args)
  }

  public async onDataReceived(data: Data): Promise<void> {
    if (!data.type || !data.body) {
      this._error('Invalid data:', JSON.stringify(data, null, 2))
      return
    }

    switch (data.type) {
      case 'request':
        return this._onRequestReceived(data.body as Request)
      default:
        this._error(
          'Invalid data: unknown type:',
          JSON.stringify(data, null, 2)
        )
    }
  }

  private _sendErrorResponse(id: number, error: TaskError): void {
    this._agentCoreManager.sendResponse({
      id: id,
      success: false,
      error: {
        message: error.message,
        code: error.code,
        info: error.info
      }
    })
  }

  private _sendResponse(id: number): void {
    this._agentCoreManager.sendResponse({
      id: id,
      success: true
    })
  }

  private _createTask(
    taskType: string,
    settings: Record<string, any>
  ): Task | undefined {
    switch (taskType) {
      case 'remoteLogin':
        return new TaskRemoteLogin(this, settings)
      case 'remoteLoginStatusUpdate':
        return new TaskRemoteLoginStatusUpdate(this, settings)
      case 'rotatePublicKey':
        return new TaskRotatePublicKey(this, settings)
      default:
        return undefined
    }
  }

  public async _onRequestReceived(request: Request): Promise<void> {
    if (!request.id || !request.taskType || !request.settings) {
      this._error('Invalid request:', JSON.stringify(request, null, 2))
      return
    }

    const task = this._createTask(request.taskType, request.settings)
    if (!task) {
      const msg = `Unknown task type: ${request.taskType}`
      this._error(msg)
      this._sendErrorResponse(request.id, new TaskError('ERR_INVALID_TYPE', msg))
      return
    }

    const id = request.id
    this._debug(`Starting task ${id} (${task.type})...`)
    this._runningTasks[id] = task.run()
    try {
      await this._runningTasks[id]
    } catch (err) {
      this._debug(`Task ${id} failed, reason: ${err.message}`)
      this._sendErrorResponse(id, err)
      delete this._runningTasks[id]
      return
    }
    this._sendResponse(id)
    this._debug(`Task ${id} stopped`)
    delete this._runningTasks[id]
  }

  public async cleanup(): Promise<void> {
    for (const [id, promise] of Object.entries(this._runningTasks)) {
      await promise
      delete this._runningTasks[id]
    }

    await this._ssh.stopServer()
    await this._ssh.stopClient()
  }
}
