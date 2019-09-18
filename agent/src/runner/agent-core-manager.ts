import { fork, ChildProcess } from 'child_process'
import EventEmitter from 'events'
import { Data, Log, Response, StatusUpdate } from './agent-runner-message-type'

interface UserInfo {
  user: string
  gid: number
  uid: number
}

export default class AgentCoreManager extends EventEmitter {
  private _cproc?: ChildProcess

  private _send(msg: Data): void {
    if (this._cproc && this._cproc.send) {
      this._cproc.send(msg)
    }
  }

  public sendResponse(response: Response): void {
    return this._send({
      type: 'response',
      body: response
    })
  }

  public sendStatusUpdate(statusUpdate: StatusUpdate): void {
    return this._send({
      type: 'statusUpdate',
      body: statusUpdate
    })
  }

  public sendLog(log: Log): void {
    return this._send({
      type: 'log',
      body: log
    })
  }

  public async startAgentCore(
    portBasePath: string,
    userInfo?: UserInfo
  ): Promise<void> {
    return new Promise((resolve, reject): void => {
      const startupModule = process.argv[1]
      let args = ['--start-core']

      if (process.argv.length > 2) {
        args = args.concat(process.argv.slice(2))
      }

      const cproc = fork(
        startupModule,
        args,
        userInfo
          ? {
              stdio: [0, 1, 2, 'ipc'],
              cwd: portBasePath,
              uid: userInfo.uid,
              gid: userInfo.gid
            }
          : {
              stdio: [0, 1, 2, 'ipc'],
              cwd: portBasePath
            }
      )
      if (cproc.stdout) {
        cproc.stdout.on('data', data => {
          console.info(data.toString().replace(/(\n|\r)+$/, ''))
        })
      }
      if (cproc.stderr) {
        cproc.stderr.on('data', data => {
          console.error(data.toString().replace(/(\n|\r)+$/, ''))
        })
      }
      cproc.once('exit', (code, signal) => {
        let message
        if (code === null) {
          message = `agent-core killed by signal ${signal}`
          // killed by signal treated as normally exiting
          code = 0
        }
        else {
          message = `agent-core exited, code ${code}`
        }
        this._cproc = undefined
        this.emit('agentCoreTerminated', code, message)
      })
      cproc.once('error', err => {
        reject(err)
      })
      cproc.on('message', msg => {
        this.emit('dataReceived', msg)
      })

      this._cproc = cproc
      resolve()
    })
  }

  public async shutdownAgentCore(): Promise<void> {
    if (!this._cproc) return

    return new Promise((resolve, reject): void => {
      setTimeout(() => {
        resolve()
      }, 5000)

      if (this._cproc) {
        this._cproc.once('exit', (code, signal) => {
          resolve()
        })
      }
    })
  }
}
