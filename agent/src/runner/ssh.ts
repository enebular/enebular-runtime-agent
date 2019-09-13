import { execSync, spawn, ChildProcess } from 'child_process'
import { getUserInfo, exec } from '../utils'

interface SSHClientOptions {
  deviceUser: string
  serverIPaddr: string
  serverPort: string
  serverUser: string
  identify: string
}

class SSH {
  private _serverActive: boolean = false
  private _sshClient?: ChildProcess

  private static instance: SSH

  private constructor() {

  }

  private _info(...args: any[]): void {
    console.info(...args)
  }

  private init() {
    this._serverActive = this.isServiceActive('sshd')
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
    }
    else {
      this._info('SSH server already started')
    }
  }

  public async stopServer(): Promise<void> {
    if (this._serverActive) {
      await this._exec("sudo service sshd stop")
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

      this._sshClient = cproc
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
          resolve()
        })
        cproc.kill('SIGINT')
      } else {
        this._info('SSH client already shutdown')
        resolve()
      }
    })
  }

  public static getInstance() {
    if (!SSH.instance) {
      SSH.instance = new SSH()
      SSH.instance.init()
    }
    return SSH.instance
  }
}

export { SSH, SSHClientOptions } 
