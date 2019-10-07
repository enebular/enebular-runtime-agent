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
    if (
      !this._agentCoreManager.sendLog({
        level: level,
        msg: log
      })
    ) {
      if (
        process.env.DEBUG &&
        !(level === 'debug' && process.env.DEBUG !== 'debug')
      )
        console.info('service.runner:', log)
    }
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
