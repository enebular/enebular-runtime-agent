import * as path from 'path'
import { execSync, fork, ChildProcess } from 'child_process'
import CommandLine from './command-line'
import Config from './config'

interface UserInfo {
  user: string
  gid: number
  uid: number
}

class AgentRunner {
  private _cproc?: ChildProcess
  private _config: Config
  private _commandLine: CommandLine
  private _userInfo?: UserInfo
  private _portBasePath: string

  public constructor(portBasePath: string) {
    this._portBasePath = portBasePath
    this._config = new Config(portBasePath)
    this._commandLine = new CommandLine(this._config, true)
  }

  private _debug(...args: any[]): void {
    if (process.env.DEBUG === 'debug') console.info('runner:', ...args)
  }

  private _info(...args: any[]): void {
    console.info(...args)
  }

  private _execReturnStdout(cmd: string): string | undefined {
    try {
      return execSync(cmd).toString()
    } catch (err) {
      return undefined
    }
  }

  private _getUserInfo(user: string): UserInfo {
    let ret = this._execReturnStdout(`id -u ${user}`)
    if (!ret) {
      throw new Error('Failed to get user uid')
    }
    const uid = parseInt(ret)
    ret = this._execReturnStdout(`id -g ${user}`)
    if (!ret) {
      throw new Error('Failed to get user gid')
    }
    const gid = parseInt(ret)
    return {
      user: user,
      gid: gid,
      uid: uid
    }
  }

  public async _startEnebularAgent(): Promise<boolean> {
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
        this._userInfo
          ? {
              stdio: [0, 1, 2, 'ipc'],
              cwd: this._portBasePath,
              uid: this._userInfo.uid,
              gid: this._userInfo.gid
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
      cproc.on('message', msg => {
        this._debug(msg.toString())
      })
      cproc.once('exit', (code, signal) => {})
      cproc.once('error', err => {
        reject(err)
      })
      this._cproc = cproc
    })
  }

  public async startup(): Promise<boolean> {
    /* strip out help argument therefore the help will be returned by agent core */
    const argv = process.argv.filter(arg => (arg !== '--help' && arg !== '-h'))
    this._commandLine.parse(argv)
    this._config.importItems(this._commandLine.getConfigOptions())

    if (process.getuid() !== 0) {
      this._debug('Run as non-root user.')
    } else {
      this._debug('Run as root user.')
      if (!this._config.isOverridden('ENEBULAR_AGENT_USER')) {
        console.error(`--user <user> must be specified when running as root`)
        return false
      }
      const user = this._config.get('ENEBULAR_AGENT_USER')
      try {
        this._userInfo = this._getUserInfo(user)
      } catch (err) {
        console.error(`Failed to get user info for ${user}`)
        return false
      }
    }
    return this._startEnebularAgent()
  }

  public async shutdown(): Promise<void> {
    if (!this._cproc) return

    return new Promise((resolve, reject): void => {
      setTimeout(() => {
        resolve()
      }, 5000)

      if (this._cproc) {
        this._cproc.once('exit', (code, signal) => {
          this._info('enebular-agent has terminated.')
          resolve()
        })
      }
    })
  }
}

let runner: AgentRunner

function startup(portBasePath: string): Promise<boolean> {
  runner = new AgentRunner(portBasePath)
  return runner.startup()
}

async function shutdown(): Promise<void> {
  try {
    await runner.shutdown()
  } catch (err) {
    // ignore
  }
}

export { startup, shutdown }
