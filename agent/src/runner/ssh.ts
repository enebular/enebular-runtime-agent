import * as fs from 'fs'
import * as path from 'path'
import { execSync, spawn, ChildProcess } from 'child_process'
import { execReturnStdout, getUserInfo, exec } from '../utils'
import EventEmitter from 'events'
import AgentRunnerLogger from './agent-runner-logger'

export interface SSHClientConnectOptions {
  user: string
  remoteUser: string
  remoteIPAddr: string
  remotePort: string
  privateKey: string
}

export interface SSHServerOptions {
  user: string
  publicKey: string
}

export class SSH extends EventEmitter {
  private _serverActive = false
  private _sshClient?: ChildProcess
  private _log: AgentRunnerLogger

  private static instance: SSH

  private constructor(log: AgentRunnerLogger) {
    super()
    this._log = log
  }

  private _debug(...args: any[]): void {
    this._log.debug(...args)
  }

  private _info(...args: any[]): void {
    this._log.info(...args)
  }

  public init(): void {
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
      } catch (err) {
        reject(err)
      }
      resolve()
    })
  }

  public async startServer(options: SSHServerOptions): Promise<void> {
    if (!this._serverActive) {
      const getentResult = execReturnStdout(`getent passwd ${options.user}`)
      if (!getentResult) {
        throw new Error(`Failed to get home directory of user ${options.user}`)
      }
      const userInfo = getUserInfo(options.user)
      const userHome = getentResult.split(':')[5]
      const userSSHPath = `${userHome}/.ssh`
      this._debug(userHome)
      try {
        if (!fs.existsSync(userSSHPath)) {
          fs.mkdirSync(userSSHPath)
          fs.chownSync(userSSHPath, userInfo.uid, userInfo.gid)
          fs.chmodSync(userSSHPath, 0o600)
        }
        const authorizedKeys = `${userSSHPath}/authorized_keys`
        if (!fs.existsSync(authorizedKeys)) {
          fs.writeFileSync(authorizedKeys, options.publicKey, 'utf8')
          fs.chownSync(authorizedKeys, userInfo.uid, userInfo.gid)
          fs.chmodSync(authorizedKeys, 0o600)
        }
        else {
          const keys = fs.readFileSync(authorizedKeys, 'utf8')
          if (keys.indexOf(options.publicKey) === -1) {
            fs.appendFileSync(authorizedKeys, options.publicKey, 'utf8')
          }
        }
      } catch (err) {
        throw new Error(`Failed to save public key: ${err.message}`)
      }

      await this._exec('service sshd start')
      this._serverActive = true
      this.emit('serverStatusChanged', this._serverActive)
    } else {
      this._info('SSH server already started')
    }
  }

  public async stopServer(): Promise<void> {
    if (this._serverActive) {
      await this._exec('service sshd stop')
      this._serverActive = false
      this.emit('serverStatusChanged', this._serverActive)
    } else {
      this._info('SSH server already shutdown')
    }
  }

  public async startClient(options: SSHClientConnectOptions): Promise<void> {
    return new Promise((resolve, reject): void => {
      if (this._sshClient) {
        this._info('ssh-client already started')
        resolve()
        return
      }

      const userInfo = getUserInfo(options.user)
      const privateKeyPath = path.resolve(__dirname, '../../keys/tmp_private_key')
      fs.writeFileSync(privateKeyPath, options.privateKey, 'utf8')
      fs.chmodSync(privateKeyPath, 0o600)
      fs.chownSync(privateKeyPath, userInfo.uid, userInfo.gid)
      // TODO: should we remove key when stopping

      const args = [
        "-v",
        "-N",
        "-o ExitOnForwardFailure=yes",
        "-o StrictHostKeyChecking=no",
        `-R ${options.remotePort}:localhost:22`,
        `-i${privateKeyPath}`,
        `${options.remoteUser}@${options.remoteIPAddr}`
      ]

      const cproc = spawn('ssh', args, {
        stdio: 'pipe',
        uid: userInfo.uid,
        gid: userInfo.gid
      })
      cproc.stdout.on('data', data => {
        this._debug('ssh-client: ', data.toString().replace(/(\n|\r)+$/, ''))
      })
      cproc.stderr.on('data', data => {
        const connected = data.indexOf('All remote forwarding requests processed') !== -1 ? true : false 
        const _data = data.toString().replace(/(\n|\r)+$/, '')
        this._debug('ssh-client: ', _data)
        if (connected) {
          this.emit('clientStatusChanged', true)
          resolve()
        }
      })
      cproc.once('exit', (code, signal) => {
        const message =
          code !== null
            ? `ssh-client exited, code ${code}`
            : `ssh-client killed by signal ${signal}`
        this._debug(message)
        this._sshClient = undefined
        if (code !== 0) {
          reject(new Error(message))
        }
      })
      cproc.once('error', err => {
        reject(err)
      })

      // TODO: detect client is connected
      this._sshClient = cproc
    })
  }

  public async stopClient(): Promise<void> {
    return new Promise((resolve, reject): void => {
      const cproc = this._sshClient
      if (cproc) {
        this._info('Shutting down ssh client...')
        cproc.once('exit', () => {
          this._info('ssh-client ended')
          this._sshClient = undefined
          this.emit('clientStatusChanged', false)
          resolve()
        })
        cproc.kill('SIGINT')
      } else {
        this._info('ssh-client already shutdown')
        resolve()
      }
    })
  }

  public static getInstance(log: AgentRunnerLogger): SSH {
    if (!SSH.instance) {
      SSH.instance = new SSH(log)
    }
    return SSH.instance
  }
}
