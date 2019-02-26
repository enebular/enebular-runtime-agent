import Migration from './migration'
import Migrator from '../migrator'
import Utils from '../utils'

export default class CopyMigration extends Migration {
  protected _copyFrom: string
  protected _copyTo: string
  protected _migrator: Migrator

  public constructor(
    name: string,
    copyFrom: string,
    copyTo: string,
    migrator: Migrator,
    optional = false
  ) {
    super(name, 'copy', optional)
    this._name = name
    this._migrator = migrator
    this._copyFrom = migrator.migrateConfig[copyFrom]
    this._copyTo = migrator.migrateConfig[copyTo]
  }

  public async _do(): Promise<{}> {
    return Utils.copy(
      this._migrator.log,
      `${this._copyFrom}/${this._name}`,
      `${this._copyTo}/${this._name}`,
      this._migrator.userInfo
    )
  }
}


