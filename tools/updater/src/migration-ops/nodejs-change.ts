import { MigrationOps, MigrationOpsState } from './migration-ops'
import { MigrateContext } from '../migrator'

export interface NodeJSState extends MigrationOpsState {
  version: string
}

export default class NodeJSChange extends MigrationOps {
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

    this.reverse = (): void => {
      if (this._context) {
        // TODO: make it generic
        this._context.system.updateNodeJSVersionInSystemd(
          this._context.userInfo.user,
          (this._desiredState as NodeJSState).version,
          (this._currentState as NodeJSState).version
        )
      }
    }
  }

  public do(context: MigrateContext): void {
    context.system.updateNodeJSVersionInSystemd(
      context.userInfo.user,
      (this._currentState as NodeJSState).version,
      (this._desiredState as NodeJSState).version
    )
    this._context = context
  }
}
