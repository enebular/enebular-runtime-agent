export default abstract class Migration {
  protected _name: string
  protected _optional: boolean

  public reverse?: () => Promise<void> | void

  protected constructor(name: string, optional: boolean) {
    this._name = name
    this._optional = optional
  }

  public get optional(): boolean {
    return this._optional
  }

  public get name(): string {
    return this._name
  }

  public abstract _do(): Promise<void> | void
}
