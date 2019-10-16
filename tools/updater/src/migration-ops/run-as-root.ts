import { MigrationOp, MigrationOpState } from './migration-op'
import { MigrateContext } from '../migrator'

export default class RunAsRoot extends MigrationOp {
  private _context?: MigrateContext

  public constructor(
    name: string,
    optional = false
  ) {
    super(name, { type: 'run as root' }, { type: 'run as root' }, optional)

    this.reverse = (): void => {
      if (this._context) {
        this._context.system.reverseRunningUserToRootInSystemd(
          this._context.userInfo.user
        )
      }
    }
  }

  public do(context: MigrateContext): void {
    context.system.updateRunningUserToRootInSystemd(
      context.userInfo.user
    )
    this._context = context
  }
}
