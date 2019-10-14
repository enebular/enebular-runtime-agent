import { fork, ChildProcess } from 'child_process'
import EventEmitter from 'events'
import { Data, Log, Response, StatusUpdate } from './agent-runner-message-type'
import { UserInfo } from '../utils'

export default class AgentCoreManager extends EventEmitter {
  private _cproc?: ChildProcess

  private _send(msg: Data): boolean {
    if (this._cproc && this._cproc.send) {
      try {
        this._cproc.send(msg)
        return true
      }
      catch (err) {
        console.error(`Send message to agent core failed: ${err.message}`)
        return false
      }
    }
    return false
  }

  public sendResponse(response: Response): boolean {
    return this._send({
      type: 'response',
      body: response
    })
  }

  public sendStatusUpdate(statusUpdate: StatusUpdate): boolean {
    return this._send({
      type: 'statusUpdate',
      body: statusUpdate
    })
  }

  public sendLog(log: Log): boolean {
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
        } else {
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

  public async waitAgentCoreToShutdown(): Promise<void> {
    if (!this._cproc) return

    return new Promise((resolve): void => {
      setTimeout(() => {
        // Agent core shall receive signal by itself, wait for 15 seconds to force kill it
        if (this._cproc) this._cproc.kill('SIGKILL')
      }, 15 * 1000)

      this.on('agentCoreTerminated', () => {
        resolve()
      })
    })
  }
}
