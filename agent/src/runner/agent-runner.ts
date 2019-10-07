import CommandLine from '../command-line'
import Config from '../config'
import { getUserInfo } from '../utils'
import AgentRunnerService from './agent-runner-service'
import AgentCoreManager from './agent-core-manager'
import AgentRunnerLogger from './agent-runner-logger'

export default class AgentRunner {
  private _config: Config
  private _commandLine: CommandLine
  private _portBasePath: string
  private _agentCoreManager: AgentCoreManager
  private _log: AgentRunnerLogger
  private _agentRunnerService?: AgentRunnerService

  public constructor(portBasePath: string) {
    this._portBasePath = portBasePath
    this._config = new Config(portBasePath)
    this._commandLine = new CommandLine(this._config, true)
    this._agentCoreManager = new AgentCoreManager()
    this._log = new AgentRunnerLogger(this._agentCoreManager)
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

    this._agentCoreManager.on('agentCoreTerminated', async (code, message) => {
      this._debug(`Agent core terminated, ${message}`)
      if (this._agentRunnerService) await this._agentRunnerService.cleanup()
      process.exit(code)
    })
    await this._agentCoreManager.startAgentCore(this._portBasePath, userInfo)
    this._agentRunnerService = new AgentRunnerService(this._agentCoreManager)
    return true
  }

  public async shutdown(): Promise<void> {
    await this._agentCoreManager.waitAgentCoreToShutdown()
  }
}
