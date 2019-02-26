export default abstract class Migration {
  protected _name: string
  protected _type: string

  protected constructor(name: string, type: string) {
    this._name = name
    this._type = type
  }
  public abstract _do(): Promise<{}>
}


