import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'
import { execReturnStdout, getUserInfo } from '../utils'
import EventEmitter from 'events'
import AgentRunnerLogger from './agent-runner-logger'
import ProcessManager from './process-manager'

interface SSHClientOptions {
  user: string
  localServerPort: string
  remoteUser: string
  remoteIPAddr: string
  remotePort: string
  privateKey: string
}

interface SSHServerOptions {
  user: string
  port: string
  publicKey: string
}

export interface SSHConfig {
  enable: boolean
  clientOptions?: SSHClientOptions
  serverOptions?: SSHServerOptions
}

export class SSH extends EventEmitter {
  private _serverActive = false
  private _clientActive = false
  private _log: AgentRunnerLogger
  private _sshProcessingChanges?: boolean
  private _pendingConfig: SSHConfig | null = null
  private _sshClientManager: ProcessManager
  private _sshServerManager: ProcessManager
  private _privateKeyPath: string

  public constructor(log: AgentRunnerLogger) {
    super()
    this._log = log
    this._sshClientManager = new ProcessManager('ssh-client', this._log)
    this._sshClientManager.maxRetryCount = 3
    this._sshServerManager = new ProcessManager('ssh-server', this._log)
    this._sshServerManager.maxRetryCount = 3
    this._privateKeyPath = path.resolve(__dirname, '../../keys/tmp_private_key')
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

  public init(): void {
    this.statusUpdate()
  }

  public statusUpdate(): void {
    this.emit('statusChanged', this._clientActive && this._serverActive)
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
      try {
        if (!fs.existsSync(userSSHPath)) {
          fs.mkdirSync(userSSHPath)
          fs.chownSync(userSSHPath, userInfo.uid, userInfo.gid)
          fs.chmodSync(userSSHPath, 0o700)
        }
        const authorizedKeys = `${userSSHPath}/authorized_keys`
        if (!fs.existsSync(authorizedKeys)) {
          fs.writeFileSync(authorizedKeys, options.publicKey, 'utf8')
          fs.chownSync(authorizedKeys, userInfo.uid, userInfo.gid)
          fs.chmodSync(authorizedKeys, 0o600)
        } else {
          const keys = fs.readFileSync(authorizedKeys, 'utf8')
          if (keys.indexOf(options.publicKey) === -1) {
            fs.appendFileSync(authorizedKeys, options.publicKey, 'utf8')
          }
        }
      } catch (err) {
        throw new Error(`Failed to save public key: ${err.message}`)
      }

      this._sshServerManager.on('started', () => {
        this._serverActive = true
        this._debug(`ssh-server active: ${this._serverActive}`)
        this.statusUpdate()
      })

      this._sshServerManager.on('permanentlyTerminated', () => {
        this._serverActive = false
        this._debug(`ssh-server active: ${this._serverActive}`)
        this.statusUpdate()
      })
      this._sshServerManager.startedIfTraceContains(
        `Server listening on :: port ${options.port}`,
        30 * 1000
      )

      const args = [
        '-D',
        '-e',
        '-o LogLevel=DEBUG',
        `-o AllowUsers=${options.user}`,
        '-o PasswordAuthentication=no',
        '-o ClientAliveInterval=30',
        '-o ClientAliveCountMax=3',
        `-p ${options.port}`
      ]

      return this._sshServerManager.start('/usr/sbin/sshd', args)
    } else {
      this._info('ssh-server already started')
    }
  }

  public async stopServer(): Promise<void> {
    return this._sshServerManager.stop()
  }

  public async startClient(options: SSHClientOptions): Promise<void> {
    const userInfo = getUserInfo(options.user)
    const privateKeyPath = this._privateKeyPath
    fs.writeFileSync(privateKeyPath, options.privateKey, 'utf8')
    fs.chmodSync(privateKeyPath, 0o600)
    fs.chownSync(privateKeyPath, userInfo.uid, userInfo.gid)

    const args = [
      '-v',
      '-N',
      '-o ExitOnForwardFailure=yes',
      '-o StrictHostKeyChecking=no',
      '-o ServerAliveInterval=30',
      '-o ServerAliveCountMax=3',
      `-R ${options.remotePort}:localhost:${options.localServerPort}`,
      `-i${privateKeyPath}`,
      `${options.remoteUser}@${options.remoteIPAddr}`
    ]

    this._sshClientManager.on('started', () => {
      this._clientActive = true
      this._debug(`ssh-client active: ${this._clientActive}`)
      this.statusUpdate()
    })

    this._sshClientManager.on('permanentlyTerminated', () => {
      this._clientActive = false
      this._debug(`ssh-client active: ${this._clientActive}`)
      this.statusUpdate()
    })
    this._sshClientManager.startedIfTraceContains(
      'All remote forwarding requests processed',
      // It may take up to 2 mins to timeout in connecting
      3 * 60 * 1000
    )
    return this._sshClientManager.start('/usr/bin/ssh', args, userInfo)
  }

  public async stopClient(): Promise<void> {
    await this._sshClientManager.stop()
    if (fs.existsSync(this._privateKeyPath)) {
      fs.unlinkSync(this._privateKeyPath)
    }
  }

  public async setConfig(sshConfig: SSHConfig): Promise<void> {
    if (
      this._pendingConfig &&
      JSON.stringify(this._pendingConfig) === JSON.stringify(sshConfig)
    ) {
      this._info('config is identical')
      return
    }

    this._pendingConfig = sshConfig
    await this._processPendingSSHChanged()
  }

  private async _processPendingSSHChanged(): Promise<void> {
    if (this._sshProcessingChanges) {
      return
    }
    this._sshProcessingChanges = true

    while (true) {
      if (this._pendingConfig == null) {
        break
      }
      const pendingConfig = this._pendingConfig
      this._pendingConfig = null

      try {
        if (pendingConfig.enable) {
          if (!pendingConfig.serverOptions || !pendingConfig.clientOptions) {
            this._error(`options are required to start ssh`)
            continue
          }
          // sshd need to be started before launching ssh
          await this.startServer(pendingConfig.serverOptions)
          await this.startClient(pendingConfig.clientOptions)
        } else {
          await this.stopClient()
          await this.stopServer()
        }
      } catch (err) {
        this._error(`process ssh changes failed: ${err.message}`)
        if (pendingConfig.enable) {
          await this.stopClient()
          await this.stopServer()
        }
      }
    }
    this._sshProcessingChanges = false
  }
}
