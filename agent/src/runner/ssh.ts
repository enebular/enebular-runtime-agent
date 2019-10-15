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
  private _log: AgentRunnerLogger
  private _sshProcessingChanges?: boolean
  private _pendingConfig: SSHConfig | null = null
  private _sshClientManager: ProcessManager
  private _sshServerManager: ProcessManager
  private _privateKeyPath: string

  private readonly STATUS_IDLE = 'idle'
  private readonly STATUS_STARTING = 'starting'
  private readonly STATUS_RUNNING = 'running'
  private readonly STATUS_STOPPING = 'stopping'

  private _serverStatus: string
  private _clientStatus: string
  private _active: boolean

  public constructor(log: AgentRunnerLogger) {
    super()
    this._log = log
    this._sshClientManager = new ProcessManager('ssh-client', this._log)
    this._sshClientManager.maxRetryCount = 3
    this._sshServerManager = new ProcessManager('ssh-server', this._log)
    this._sshServerManager.maxRetryCount = 3
    this._privateKeyPath = path.resolve(__dirname, '../../keys/tmp_private_key')

    this._serverStatus = this.STATUS_IDLE
    this._clientStatus = this.STATUS_IDLE
    this._active = false
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
    this.emit('statusChanged', this._active)
  }

  public _statusChanged(): void {
    const active = this._clientStatus === this.STATUS_RUNNING
        && this._serverStatus === this.STATUS_RUNNING
    if (active !== this._active) {
      this._info(`ssh active: ${this._active} ==> ${active}`)
      this._active = active
      this.statusUpdate()
    }
  }

  private _clientStatusChanged(status: string): void {
    if (status === this._clientStatus)
      return
    this._info(`ssh-client status changed: ${this._clientStatus} ==> ${status}`)
    if (status === this.STATUS_IDLE) {
      if (this._clientStatus === this.STATUS_STARTING
          || this._clientStatus === this.STATUS_RUNNING) {
        this._debug(`ssh-client exited unexpected, shutting down ssh-server`)
        this.stopServer()
      }
    }
    this._clientStatus = status
    this._statusChanged()
  }

  private _serverStatusChanged(status: string): void {
    if (status === this._serverStatus)
      return
    this._info(`ssh-server status changed: ${this._serverStatus} ==> ${status}`)
    if (status === this.STATUS_IDLE) {
      if (this._serverStatus === this.STATUS_STARTING
          || this._serverStatus === this.STATUS_RUNNING) {
        this._debug(`ssh-server exited unexpected, shutting down ssh-client`)
        this.stopClient()
      }
    }
    this._serverStatus = status
    this._statusChanged()
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

  private _prepareServerPublicKey(user: string, publicKey: string) {
    const userInfo = getUserInfo(user)
    const getentResult = execReturnStdout(`getent passwd ${user}`)
    if (!getentResult) {
      throw new Error(`Failed to get home directory of user ${user}`)
    }
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
        fs.writeFileSync(authorizedKeys, publicKey, 'utf8')
        fs.chownSync(authorizedKeys, userInfo.uid, userInfo.gid)
        fs.chmodSync(authorizedKeys, 0o600)
      } else {
        const keys = fs.readFileSync(authorizedKeys, 'utf8')
        if (keys.indexOf(publicKey) === -1) {
          fs.appendFileSync(authorizedKeys, publicKey, 'utf8')
        }
      }
    } catch (err) {
      throw new Error(`Failed to save public key: ${err.message}`)
    }
  }

  public async startServer(options: SSHServerOptions): Promise<void> {
    if (this._serverStatus !== this.STATUS_IDLE) {
      this._debug(`Cannot start ssh-server, unexpected status: ${this._serverStatus}`)
      return
    }

    this._prepareServerPublicKey(options.user, options.publicKey)

    this._sshServerManager.on('started', () => {
      this._serverStatusChanged(this.STATUS_RUNNING)
    })

    this._sshServerManager.on('exited', (msg, retry) => {
      if (!retry) {
        this._serverStatusChanged(this.STATUS_IDLE)
      }
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

    this._serverStatusChanged(this.STATUS_STARTING)
    return this._sshServerManager.start('/usr/sbin/sshd', args)
  }

  public async stopServer(): Promise<void> {
    if (this._serverStatus === this.STATUS_STOPPING ||
        this._serverStatus === this.STATUS_IDLE) {
      this._debug(`Cannot stop ssh-server, unexpected status: ${this._serverStatus}`)
      return
    }
    this._serverStatusChanged(this.STATUS_STOPPING)
    return this._sshServerManager.stop()
  }

  public async startClient(options: SSHClientOptions): Promise<void> {
    if (this._clientStatus !== this.STATUS_IDLE) {
      this._debug(`Cannot start ssh-client, unexpected status: ${this._clientStatus}`)
      return
    }

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
      this._clientStatusChanged(this.STATUS_RUNNING)
    })

    this._sshClientManager.on('exited', (msg, retry) => {
      if (!retry) {
        this._clientStatusChanged(this.STATUS_IDLE)
      }
    })
    this._sshClientManager.startedIfTraceContains(
      'All remote forwarding requests processed',
      // It may take up to 2 mins to timeout in connecting
      3 * 60 * 1000
    )

    this._clientStatusChanged(this.STATUS_STARTING)
    return this._sshClientManager.start('/usr/bin/ssh', args, userInfo)
  }

  public async stopClient(): Promise<void> {
    if (this._clientStatus === this.STATUS_STOPPING ||
        this._clientStatus === this.STATUS_IDLE) {
      this._debug(`Cannot stop ssh-client, unexpected status: ${this._clientStatus}`)
      return
    }
    this._clientStatusChanged(this.STATUS_STOPPING)
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
      }
    }
    this._sshProcessingChanges = false
  }
}
