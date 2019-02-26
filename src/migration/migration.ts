export default abstract class Migration {
  protected _name: string
  protected _type: string
  protected _optional: boolean

  protected constructor(name: string, type: string, optional: boolean) {
    this._name = name
    this._type = type
    this._optional = optional
  }

  get optional(): boolean {
    return this._optional
  }

  public abstract _do(): Promise<{}>
}


