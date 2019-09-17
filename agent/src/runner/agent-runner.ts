import CommandLine from '../command-line'
import Config from '../config'
import { getUserInfo } from '../utils'
import AgentRunnerService from './agent-runner-service'
import AgentCoreManager from './agent-core-manager'

export default class AgentRunner {
  private _config: Config
  private _commandLine: CommandLine
  private _portBasePath: string
  private _agentCoreManager?: AgentCoreManager
  private _agentRunnerService?: AgentRunnerService

  public constructor(portBasePath: string) {
    this._portBasePath = portBasePath
    this._config = new Config(portBasePath)
    this._commandLine = new CommandLine(this._config, true)
  }

  private _debug(...args: any[]): void {
    if (process.env.DEBUG === 'debug') this._info(...args)
  }

  private _info(...args: any[]): void {
    console.info('runner', ...args)
  }

  private _error(...args: any[]): void {
    console.error('runner', ...args)
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
        this._error(
          `Failed to get user info for ${user}, reason: ${err.message}`
        )
        return false
      }
    }

    this._agentCoreManager = new AgentCoreManager()
    await this._agentCoreManager.startAgentCore(this._portBasePath, userInfo)
    this._agentRunnerService = new AgentRunnerService(this._agentCoreManager)
    return true
  }

  public async shutdown(): Promise<void> {
    if (this._agentCoreManager)
      return this._agentCoreManager.shutdownAgentCore()
  }
}
