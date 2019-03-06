import Migration from './migration'
import Migrator from '../migrator'

export default class NodeJSMigration extends Migration {
  protected _oldVersion: string
  protected _newVersion: string
  protected _migrator: Migrator

  public constructor(
    name: string,
    oldVersion: string,
    newVersion: string,
    migrator: Migrator,
    optional = false
  ) {
    super(name, optional)
    this._name = name
    this._migrator = migrator
    this._oldVersion = oldVersion
    this._newVersion = newVersion

    this.reverse = (): void => {
      this._migrator.system.updateNodeJSVersionInSystemd(
        this._migrator.userInfo.user,
        this._newVersion,
        this._oldVersion
      )
    }
  }

  public _do(): void {
    this._migrator.system.updateNodeJSVersionInSystemd(
      this._migrator.userInfo.user,
      this._oldVersion,
      this._newVersion
    )
  }
}
