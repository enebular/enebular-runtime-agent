import AgentRunnerLogger from './agent-runner-logger'

export default abstract class Task {
  protected _type: string
  protected _settings: Object
  protected _log: AgentRunnerLogger

  constructor(log: AgentRunnerLogger, type: string, settings: Object) {
    this._type = type
    this._settings = settings
    this._log = log
  }

  public getType(): string {
    return this._type
  }

  abstract async run(): Promise<void>

  abstract async cancel(): Promise<void>
}
