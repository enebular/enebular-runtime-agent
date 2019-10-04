import { spawn, ChildProcess } from 'child_process'
import EventEmitter from 'events'
import AgentRunnerLogger from './agent-runner-logger'
import { getUserInfo } from '../utils'

export default class ProcessManager extends EventEmitter {
  private _cproc?: ChildProcess
  private _retryCount: number = 0
  private _log: AgentRunnerLogger
  private _startedMessage?: string
  private _startedTimeout?: number
  private _name: string

  public constructor(name: string, log: AgentRunnerLogger) {
    super()
    this._name = name
    this._log = log
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

  public startedIfTraceContains(startedMessage: string, startedTimeout: number) {
    this._startedMessage = startedMessage
    this._startedTimeout = startedTimeout
  }

  public async start(command: string, args: Array<string>, user?: string): Promise<void> {
    if (this._cproc) {
      this._info(`${this._name} already started`)
      return
    }
    return new Promise((resolve, reject): void => {
      const userInfo = getUserInfo(user)
      const cproc = spawn(command, args, {
        stdio: 'pipe',
        uid: userInfo.uid,
        gid: userInfo.gid
      })
      let startTimeout
      if (this._startedMessage && this._startedTimeout) {
        startTimeout = setTimeout(async () => {
          await this.stop()
          reject(new Error(`${this._name} start timed out`))
        }, this._startedTimeout)
      }
      cproc.stdout.on('data', data => {
        this._debug(`${this._name}: `, data.toString().replace(/(\n|\r)+$/, ''))
      })
      cproc.stderr.on('data', data => {
        this._debug(`${this._name}: `, data.toString().replace(/(\n|\r)+$/, ''))
        if (this._startedMessage && startTimeout) {
            const started = data.indexOf(this._startedMessage) !== -1 ? true : false 
            if (started) {
              clearTimeout(startTimeout)
              this.emit('started', data)
              resolve()
            }
        }
      })
      cproc.once('exit', (code, signal) => {
        const message =
          code !== null
            ? `${this._name} exited, code ${code}`
            : `${this._name} killed by signal ${signal}`
        this._cproc = undefined
        this._debug(`${this._name}: `, message)
        this.emit('exit', message)
        if (this._startedMessage && startTimeout) {
          clearTimeout(startTimeout)
        }
        if (code !== 0) {
          const now = Date.now()
          this._retryCount++
          if (this._retryCount < 3) {
            this._info(
              `Unexpected exit, restarting ${this._name} in 5 seconds. Retry count:` +
                this._retryCount
            )
            setTimeout(async () => {
              try {
                await this.start(command, args, user)
                resolve()
              } catch (err) {
                reject(err)
              }
            }, 5000)
          } else {
            this._info(
              `Unexpected exit, but retry count(${this._retryCount}) exceed max.`
            )
            this._retryCount = 0
            reject(new Error(`Too many retry to start ${this._name}`))
          }
        }
      })
      cproc.once('error', err => {
        reject(err)
      })

      this._cproc = cproc
      if (!this._startedMessage)
        resolve()
    })
  }

  public async stop(): Promise<void> {
    return new Promise((resolve, reject): void => {
      const cproc = this._cproc
      if (cproc) {
        this._info(`Shutting down ${this._name}...`)
        cproc.once('exit', () => {
          resolve()
        })
        cproc.kill('SIGINT')
      } else {
        this._info(`${this._name} already shutdown`)
        resolve()
      }
    })
  }
}
