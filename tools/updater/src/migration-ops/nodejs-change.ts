import { MigrationOp, MigrationOpState } from './migration-op'
import { MigrateContext } from '../migrator'

export interface NodeJSState extends MigrationOpState {
  version: string
}

export default class NodeJSChange extends MigrationOp {
  private _context?: MigrateContext

  public constructor(
    name: string,
    currentVersion: string,
    newVersion: string,
    optional = false
  ) {
    const current: NodeJSState = { type: 'nodejs', version: currentVersion }
    const desired: NodeJSState = { type: 'nodejs', version: newVersion }
    super(name, current, desired, optional)

    this.reverse = async (): Promise<void> => {
      if (this._context) {
        await this._context.system.updateNodeJSVersionInSystemd(
          this._context.userInfo.user,
          (this._desiredState as NodeJSState).version,
          (this._currentState as NodeJSState).version
        )
      }
    }
  }

  public async do(context: MigrateContext): Promise<void> {
    this._context = context
    return context.system.updateNodeJSVersionInSystemd(
      context.userInfo.user,
      (this._currentState as NodeJSState).version,
      (this._desiredState as NodeJSState).version
    )
  }
}
