import * as path from 'path'
import { execSync, fork, ChildProcess } from 'child_process'
import CommandLine from '../command-line'
import Config from '../config'
import { getUserInfo } from '../utils'
import AgentRunnerService from './agent-runner-service'
import AgentCoreManager from './agent-core-manager'

interface UserInfo {
  user: string
  gid: number
  uid: number
}

export default class AgentRunner {
  private _cproc?: ChildProcess
  private _config: Config
  private _commandLine: CommandLine
  private _portBasePath: string

  public constructor(portBasePath: string) {
    this._portBasePath = portBasePath
    this._config = new Config(portBasePath)
    this._commandLine = new CommandLine(this._config, true)
  }

  private _debug(...args: any[]): void {
    if (process.env.DEBUG === 'debug') this._info(...args)
  }

  private _info(...args: any[]): void {
    console.info("runner", ...args)
  }

  private _error(...args: any[]): void {
    console.error("runner", ...args)
  }

  public async _startEnebularAgent(userInfo?: UserInfo): Promise<boolean> {
    this._debug('Starting enebular-agent core...')
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
              cwd: this._portBasePath,
              uid: userInfo.uid,
              gid: userInfo.gid
            }
          : {
              stdio: [0, 1, 2, 'ipc'],
              cwd: this._portBasePath
            }
      )
      if (cproc.stdout) {
        cproc.stdout.on('data', data => {
          this._info(data.toString().replace(/(\n|\r)+$/, ''))
        })
      }
      if (cproc.stderr) {
        cproc.stderr.on('data', data => {
          this._info(data.toString().replace(/(\n|\r)+$/, ''))
        })
      }
      cproc.once('exit', (code, signal) => {})
      cproc.once('error', err => {
        reject(err)
      })
      const agentCoreManager = new AgentCoreManager(cproc)
      const agentRunnerService = new AgentRunnerService(agentCoreManager)
      this._cproc = cproc
    })
  }

  public async startup(): Promise<boolean> {
    /* strip out help argument therefore the help will be returned by agent core */
    const argv = process.argv.filter(arg => arg !== '--help' && arg !== '-h')
    this._commandLine.parse(argv)
    this._config.importItems(this._commandLine.getConfigOptions())

    let userInfo
    if (process.getuid() !== 0) {
      this._debug('Run as non-root user.')
    } else {
      this._debug('Run as root user.')
      if (!this._config.isOverridden('ENEBULAR_AGENT_USER')) {
        this._error(`--user <user> must be specified when running as root`)
        return false
      }
      const user = this._config.get('ENEBULAR_AGENT_USER')
      try {
        userInfo = getUserInfo(user)
      } catch (err) {
        this._error(`Failed to get user info for ${user}, reason: ${err.message}`)
        return false
      }
    }
    return this._startEnebularAgent(userInfo)
  }

  public async shutdown(): Promise<void> {
    if (!this._cproc) return

    return new Promise((resolve, reject): void => {
      setTimeout(() => {
        resolve()
      }, 5000)

      if (this._cproc) {
        this._cproc.once('exit', (code, signal) => {
          this._debug('enebular-agent has terminated.')
          resolve()
        })
      }
    })
  }
}
