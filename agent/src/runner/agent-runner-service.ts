import * as path from 'path'
import Task from './task'
import AgentCoreManager from './agent-core-manager'

interface Data {
  type: string
  body: Request
}

interface Request {
  id: number
  type: string
  settings: Object
}

interface TaskItem {
  type: string
  modulePath: string
}

interface RunningTasks {
  [index: string]: Task
}

export default class AgentRunnerService {
  private _agentCoreManager: AgentCoreManager
  private _taskMap: TaskItem[] = []
  private _runningTasks: RunningTasks = {}
  private _taskIndex = 0

  public constructor(agentCoreManager: AgentCoreManager) {
    this._agentCoreManager = agentCoreManager
    this._agentCoreManager.on('dataReceived', async (data) =>
      await this._onDataReceived(data)
    )
    this._taskMap.push({ type: "remoteLogin", modulePath: path.resolve(__dirname, 'task-remote-login.js') })
  }

  private _debug(...args: any[]): void {
    if (process.env.DEBUG === 'debug') console.info('runner:', ...args)
  }

  private _info(...args: any[]): void {
    console.info(...args)
  }

  private _error(...args: any[]): void {
    console.error(...args)
  }

  public async _onDataReceived(data: Data): Promise<void> {
    if (!data.type || !data.body) {
      this._error("Invalid data:", JSON.stringify(data, null, 2))
      return
    }

    switch(data.type) {
    case 'request':
      return this._onRequestReceived(data.body)
    default:
      this._error("Invalid data: unknown type:", JSON.stringify(data, null, 2))
      return
    }
  }

  private _sendErrorResponse(id: number, errorMsg: string) {
    this._agentCoreManager.sendResponse({ 
      id: id,
      success: false,
      errorMsg: errorMsg
    })
  }

  public async _onRequestReceived(request: Request): Promise<void> {
    if (!request.id || !request.type || !request.settings) {
      this._error("Invalid request:", JSON.stringify(request, null, 2))
      return
    }
      
    /*
    const hash = objectHash(request.settings, { algorithm: 'sha256', encoding: 'base64' })
    this._debug("Config object hash is:", hash)

    const pubKeyPath = path.resolve(__dirname, '../../keys/pubkey.pem')
    const signature = request.signature
    const pubKey = fs.readFileSync(pubKeyPath, 'utf8')
    const verify = crypto.createVerify('SHA256')
    verify.update(hash)
    if (verify.verify(pubKey, signature, 'base64')) {
      this._debug('Signature verified OK')
    } else {
      this._error("Signature verified failed, invalid request", JSON.stringify(request, null, 2))
      return
    }
    */

    const taskItem = this._taskMap.filter(item => item.type === request.type)
    if (taskItem.length < 1) {
      const msg = `unknown request type:${request.type}`
      this._error(msg)
      this._sendErrorResponse(request.id, msg)
      return
    }

    const taskModule = await import(taskItem[0].modulePath)
    const task = taskModule.create(request.settings)

    const id = request.id
    this._runningTasks[id] = task

    this._debug(`starting task ${id} ...`)
    try {
      await task.run()
      this._agentCoreManager.sendResponse({ 
        id: id,
        success: true,
      })
    }
    catch(err) {
      this._debug(`task ${id} failed, reason: ${err.message}`)
      this._sendErrorResponse(id, err.message)
    }
    this._debug(`task ${id} stopped`)
    delete this._runningTasks[id]
  }
}
