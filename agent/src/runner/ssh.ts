import * as fs from 'fs'
import * as path from 'path'
import { execSync, spawn, ChildProcess } from 'child_process'
import { execReturnStdout, getUserInfo, exec } from '../utils'
import ProcessUtil, { RetryInfo } from '../process-util'
import EventEmitter from 'events'
import AgentRunnerLogger from './agent-runner-logger'

interface SSHClientOptions {
  user: string
  remoteUser: string
  remoteIPAddr: string
  remotePort: string
  privateKey: string
}

interface SSHServerOptions {
  user: string
  publicKey: string
}

export interface SSHConfig{
  enable: boolean
  clientOptions?: SSHClientOptions
  serverOptions?: SSHServerOptions
}

export class SSH extends EventEmitter {
  private _serverActive = false
  private _sshClient?: ChildProcess
  private _log: AgentRunnerLogger
  private _retryCount: number = 0
  private _sshProcessingChanges? : boolean
  private _pendingConfig : SSHConfig | null = null

  public constructor(log: AgentRunnerLogger) {
    super()
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

  public init(): void {
    this._ensureServiceIsEnabled('ssh')
    this._serverActive = this.isServiceActive('ssh')
    this.emit('serverStatusChanged', this._serverActive)
    this.emit('clientStatusChanged', false)
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

      await this._exec('service ssh start')
      this._serverActive = true
      this.emit('serverStatusChanged', this._serverActive)
    } else {
      this._info('ssh-server already started')
    }
  }

  public async stopServer(): Promise<void> {
    if (this._serverActive) {
      this._info('Shutting down ssh-server...')
      await this._exec('service ssh stop')
      this._serverActive = false
      this.emit('serverStatusChanged', this._serverActive)
    } else {
      this._info('ssh-server already shutdown')
    }
  }

  public async startClient(options: SSHClientOptions): Promise<void> {
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
        "-o ServerAliveInterval=30",
        "-o ServerAliveCountMax=3",
        `-R ${options.remotePort}:localhost:22`,
        `-i${privateKeyPath}`,
        `${options.remoteUser}@${options.remoteIPAddr}`
      ]

      const cproc = spawn('ssh', args, {
        stdio: 'pipe',
        uid: userInfo.uid,
        gid: userInfo.gid
      })
      const startTimeout = setTimeout(async () => {
        await this.stopClient()
        reject(new Error('ssh-client start timed out'))
        // It may take up to 2 mins to timeout in connecting
      }, 3 * 60 * 1000)
      cproc.stdout.on('data', data => {
        this._debug('ssh-client: ', data.toString().replace(/(\n|\r)+$/, ''))
      })
      cproc.stderr.on('data', data => {
        const connected = data.indexOf('All remote forwarding requests processed') !== -1 ? true : false 
        const _data = data.toString().replace(/(\n|\r)+$/, '')
        this._debug('ssh-client: ', _data)
        if (connected) {
          clearTimeout(startTimeout)
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
        this.emit('clientStatusChanged', false)
        if (code !== 0) {
          clearTimeout(startTimeout)
          const now = Date.now()
          this._retryCount++
          if (this._retryCount < 1) {
            this._info(
              'Unexpected exit, restarting ssh-client in 5 seconds. Retry count:' +
                this._retryCount
            )
            setTimeout(async () => {
              try {
                await this.startClient(options)
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
            reject(new Error('Too many retry to start ssh-client'))
          }
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
          resolve()
        })
        cproc.kill('SIGINT')
      } else {
        this._info('ssh-client already shutdown')
        resolve()
      }
    })
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
