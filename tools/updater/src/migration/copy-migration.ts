import { Migration, MigrationState } from './migration'
import Migrator from '../migrator'
import Utils from '../utils'

export interface CopyState extends MigrationState {
  path: string
}

export class CopyMigration extends Migration {
  public constructor(
    name: string,
    copyFrom: string,
    copyTo: string,
    optional = false
  ) {
    const current: CopyState = { type: 'copy', path: copyFrom }
    const desired: CopyState = { type: 'copy', path: copyTo }
    super(name, current, desired, optional)
  }

  public async do(migrator: Migrator): Promise<void> {
    return Utils.copy(
      migrator.log,
      `${(this._currentState as CopyState).path}/${this._name}`,
      `${(this._desiredState as CopyState).path}/${this._name}`,
      migrator.userInfo
    )
  }
}

export default CopyMigration
