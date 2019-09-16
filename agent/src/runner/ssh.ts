import { execSync, spawn, ChildProcess } from 'child_process'
import { getUserInfo, exec } from '../utils'
import EventEmitter from 'events'
import AgentRunnerLogger from './agent-runner-logger'

interface SSHClientOptions {
  deviceUser: string
  serverIPaddr: string
  serverPort: string
  serverUser: string
  identify: string
}

class SSH extends EventEmitter {
  private _serverActive: boolean = false
  private _sshClient?: ChildProcess
  private _log: AgentRunnerLogger

  private static instance: SSH

  private constructor (log: AgentRunnerLogger) {
    super()
    this._log = log
  }

  private _info(...args: any[]): void {
    this._log.info(...args)
  }

  public init() {
    this._serverActive = this.isServiceActive('sshd')
    this.emit('serverStatusChanged', this._serverActive)
  }

  private isServiceActive(serviceName: string): boolean {
    return exec(`systemctl is-active --quiet ${serviceName}`)
  }

  private _exec(cmd: string): Promise<void> {
    return new Promise((resolve, reject): void => {
      try {
        execSync(cmd)
      }
      catch (err) {
        reject(err)
      }
      resolve()
    })
  }

  public async startServer(): Promise<void> {
    if (!this._serverActive) {
      await this._exec("sudo service sshd start")
      this._serverActive = true
      this.emit('serverStatusChanged', this._serverActive)
    }
    else {
      this._info('SSH server already started')
    }
  }

  public async stopServer(): Promise<void> {
    if (this._serverActive) {
      await this._exec("sudo service sshd stop")
      this._serverActive = false
      this.emit('serverStatusChanged', this._serverActive)
    }
    else {
      this._info('SSH server already shutdown')
    }
  }

  public async startClient(options: SSHClientOptions): Promise<void> {
    return new Promise((resolve, reject): void => {
      if (this._sshClient) {
        this._info('SSH client already started')
        resolve()
        return
      }

      const deviceUserInfo = getUserInfo(options.deviceUser)
      const args = [
        `${options.serverUser}@${options.serverIPaddr}`,
        `-p ${options.serverPort}`,
        `-i ${options.identify}`,
      ]

      const cproc = spawn(
        "ssh",
        args,
        {
          stdio: 'pipe',
          uid: deviceUserInfo.uid,
          gid: deviceUserInfo.gid
        }
      )
      cproc.stdout.on('data', data => {
        this._info('sshClient:', data.toString().replace(/(\n|\r)+$/, ''))
      })
      cproc.stderr.on('data', data => {
        this._info('sshClient:', data.toString().replace(/(\n|\r)+$/, ''))
      })
      cproc.once('exit', (code, signal) => {})
      cproc.once('error', err => {
        reject(err)
      })

      // TODO: detect client is connected
      this._sshClient = cproc
      this.emit('clientStatusChanged', true)
      resolve()
    })
  }

  public async stopClient(): Promise<void> {
    return new Promise((resolve, reject) => {
      const cproc = this._sshClient
      if (cproc) {
        this._info('Shutting down ssh client...')
        cproc.once('exit', () => {
          this._info('SSH client ended')
          this._sshClient = undefined
          this.emit('clientStatusChanged', false)
          resolve()
        })
        cproc.kill('SIGINT')
      } else {
        this._info('SSH client already shutdown')
        resolve()
      }
    })
  }

  public static getInstance(log: AgentRunnerLogger) {
    if (!SSH.instance) {
      SSH.instance = new SSH(log)
    }
    return SSH.instance
  }
}

export { SSH, SSHClientOptions } 
