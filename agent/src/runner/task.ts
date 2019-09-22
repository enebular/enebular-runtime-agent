import AgentRunnerService from './agent-runner-service'

export default abstract class Task {
  protected _type: string
  protected _settings: Record<string, any>
  protected _service: AgentRunnerService

  constructor(
    service: AgentRunnerService,
    type: string,
    settings: Record<string, any>
  ) {
    this._type = type
    this._settings = settings
    this._service = service
  }

  get type(): string {
    return this._type
  }

  protected _debug(...args: any[]): void {
    this._service.log.debug(...args)
  }

  protected _info(...args: any[]): void {
    this._service.log.info(...args)
  }

  protected _error(...args: any[]): void {
    this._service.log.error(...args)
  }

  abstract async run(): Promise<void>

  abstract async cancel(): Promise<void>
}
