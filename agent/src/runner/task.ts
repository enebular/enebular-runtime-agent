export default abstract class Task {
  protected _type: string
  protected _settings: Object

  constructor(type: string, settings: Object) {
    this._type = type
    this._settings = settings
  }

  public getType(): string {
    return this._type
  }

  abstract async run(): Promise<void>

  abstract async cancel(): Promise<void>
}
