import * as fs from 'fs'
import * as path from 'path'
import crypto from 'crypto'
import objectHash from 'object-hash'
import Task from './task'

interface Request {
  type: string
  settings: Object
  signature: string
}

interface TaskItem {
  type: string
  modulePath: string
}

interface RunningTasks {
  [index: string]: Task
}

export default class AgentRunnerService {
  private _taskMap: TaskItem[] = []
  private _runningTasks: RunningTasks = {}
  private _taskIndex = 0

  public constructor() {
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

  public async onRequestReceived(request: Request) {
    if (!request.type || !request.settings || !request.signature) {
      this._error("Invalid request:", JSON.stringify(request, null, 2))
      return
    }
      
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


    const taskItem = this._taskMap.filter(item => item.type === request.type)
    if (taskItem.length < 1) {
      this._error("unknown request type:", request.type)
      return
    }

    const taskModule = await import(taskItem[0].modulePath)
    const task = taskModule.create(request.settings)

    const id = this._taskIndex++
    this._runningTasks[id] = task

    this._debug(`starting task ${id} ...`)
    try {
      await task.run()
      // TODO: send task response
    }
    catch(err) {
      this._debug(`task ${id} failed, reason: ${err.message}`)
      // TODO: send task response
    }
    this._debug(`task ${id} stopped`)
    delete this._runningTasks[id]
  }
}
