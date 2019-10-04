import * as fs from 'fs'
import * as path from 'path'
import { execSync, spawn, ChildProcess } from 'child_process'
import { execReturnStdout, getUserInfo, exec } from '../utils'
import ProcessUtil, { RetryInfo } from '../process-util'
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

export interface SSHConfig{
  enable: boolean
  clientOptions?: SSHClientOptions
  serverOptions?: SSHServerOptions
}

export class SSH extends EventEmitter {
  private _serverActive = false
  private _clientActive = false
  private _log: AgentRunnerLogger
  private _sshProcessingChanges? : boolean
  private _pendingConfig : SSHConfig | null = null
  private _sshClientManager: ProcessManager
  private _sshServerManager: ProcessManager

  public constructor(log: AgentRunnerLogger) {
    super()
    this._log = log
    this._sshClientManager = new ProcessManager('ssh-client', this._log)
    this._sshServerManager = new ProcessManager('ssh-server', this._log)
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
    this._ensureServiceIsEnabled('ssh')
    this._serverActive = this.isServiceActive('ssh')
    this.statusUpdate()
  }

  public statusUpdate(): void {
    this.emit('serverStatusChanged', this._serverActive)
    this.emit('clientStatusChanged', this._clientActive)
  }

  private isServiceActive(serviceName: string): boolean {
    return exec(`systemctl is-active --quiet ${serviceName}`)
  }

  private _ensureServiceIsEnabled(serviceName: string): void {
    if (!exec(`systemctl is-enabled --quiet ${serviceName}`)) {
      return exec(`systemctl enable -quiet ${serviceName}`)
    }
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

      this._sshServerManager.on('started', () => {
        this._serverActive = true
        this.emit('serverStatusChanged', this._serverActive)
      })

      this._sshServerManager.on('exit', (message) => {
        this._serverActive = false
        this.emit('serverStatusChanged', this._serverActive)
      })
      this._sshServerManager.startedIfTraceContains(
          `Server listening on :: port ${options.port}`,
          30 * 1000)

      const args = [
        "-D",
        "-d",
        `-p ${options.port}`
      ]

      return this._sshServerManager.start('/usr/sbin/sshd', args, options.user)
    } else {
      this._info('ssh-server already started')
    }
  }

  public async stopServer(): Promise<void> {
    return this._sshServerManager.stop()
  }

  public async startClient(options: SSHClientOptions): Promise<void> {
    const userInfo = getUserInfo(options.user)
    const privateKeyPath = path.resolve(__dirname, '../../keys/tmp_private_key')
    fs.writeFileSync(privateKeyPath, options.privateKey, 'utf8')
    fs.chmodSync(privateKeyPath, 0o600)
    fs.chownSync(privateKeyPath, userInfo.uid, userInfo.gid)

    const args = [
      "-v",
      "-N",
      "-o ExitOnForwardFailure=yes",
      "-o StrictHostKeyChecking=no",
      "-o ServerAliveInterval=30",
      "-o ServerAliveCountMax=3",
      `-R ${options.remotePort}:localhost:${options.localServerPort}`,
      `-i${privateKeyPath}`,
      `${options.remoteUser}@${options.remoteIPAddr}`
    ]

    this._sshClientManager.on('started', () => {
      this._clientActive = true
      this.emit('clientStatusChanged', this._clientActive)
    })

    this._sshClientManager.on('exit', (message) => {
      this._clientActive = false
      this.emit('clientStatusChanged', this._clientActive)
    })
    this._sshClientManager.startedIfTraceContains(
        'All remote forwarding requests processed',
        // It may take up to 2 mins to timeout in connecting
        3 * 60 * 1000)
    return this._sshClientManager.start('/usr/bin/ssh', args, options.user)
  }

  public async stopClient(): Promise<void> {
    return this._sshClientManager.stop()
  }

  public async setConfig(sshConfig: SSHConfig): Promise<void> {
    if (this._pendingConfig && 
        JSON.stringify(this._pendingConfig) === JSON.stringify(sshConfig)) {
      this._info('config is identical')
      return
    }

    this._pendingConfig = sshConfig
    await this._processPendingSSHChanged()
  }

  private async _processPendingSSHChanged() : Promise<void> {
    if (this._sshProcessingChanges) {
      return
    }
    this._sshProcessingChanges = true

    while (true) {
      if (this._pendingConfig == null) {
        break
      }
      let pendingConfig = this._pendingConfig
      this._pendingConfig = null

      let promises: Promise<void>[] = []
      if (pendingConfig.enable) {
        if (!pendingConfig.serverOptions || !pendingConfig.clientOptions) {
          this._error(`options are required to start ssh`)
          continue
        }
        promises.push(this.startServer(pendingConfig.serverOptions))
        promises.push(
          this.startClient(pendingConfig.clientOptions)
        )
      }
      else {
        promises.push(this.stopServer())
        promises.push(this.stopClient())
      }
      try {
        await Promise.all(promises)
      }
      catch (err) {
        this._error(`process ssh changes failed: ${err.message}`)
      }
    }
    this._sshProcessingChanges = false
  }
}
