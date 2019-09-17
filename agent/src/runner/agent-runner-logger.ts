import AgentCoreManager from './agent-core-manager'

export default class AgentRunnerLogger {
  private _agentCoreManager: AgentCoreManager

  public constructor(agentCoreManager: AgentCoreManager) {
    this._agentCoreManager = agentCoreManager
  }

  private _log(level: string, ...args: any[]): void {
    const log = args.reduce((previous, current) => {
      return previous + current
    })
    this._agentCoreManager.sendLog({
      level: level,
      msg: log
    })
  }

  public debug(...args: any[]): void {
    this._log('debug', ...args)
  }

  public info(...args: any[]): void {
    this._log('info', ...args)
  }

  public error(...args: any[]): void {
    this._log('error', ...args)
  }
}
