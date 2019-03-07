import { Migration, MigrationState } from './migration'
import Migrator from '../migrator'

export interface NodeJSState extends MigrationState {
  version: string
}

export default class NodeJSMigration extends Migration {
  public constructor(
    name: string,
    currentVersion: string,
    newVersion: string,
    optional = false
  ) {
    const current: NodeJSState = { type: 'nodejs', version: currentVersion }
    const deserve: NodeJSState = { type: 'nodejs', version: newVersion }
    super(name, current, deserve, optional)

    this.reverse = (migrator: Migrator): void => {
      migrator.system.updateNodeJSVersionInSystemd(
        migrator.userInfo.user,
        (this._deserveState as NodeJSState).version,
        (this._currentState as NodeJSState).version
      )
    }
  }

  public _do(migrator: Migrator): void {
    migrator.system.updateNodeJSVersionInSystemd(
      migrator.userInfo.user,
      (this._currentState as NodeJSState).version,
      (this._deserveState as NodeJSState).version
    )
  }
}
