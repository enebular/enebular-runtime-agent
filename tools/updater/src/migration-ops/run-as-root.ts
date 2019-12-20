import { MigrationOp, MigrationOpState } from './migration-op'
import { MigrateContext } from '../migrator'

export default class RunAsRoot extends MigrationOp {
  private _context?: MigrateContext

  public constructor(
    name: string,
    optional = false
  ) {
    super(name, { type: 'run as root' }, { type: 'run as root' }, optional)

    this.reverse = async (): Promise<void> => {
      if (this._context) {
        await this._context.system.reverseRunningUserToRootInSystemd(
          this._context.userInfo.user
        )
      }
    }
  }

  public async do(context: MigrateContext): Promise<void> {
    this._context = context
    return context.system.updateRunningUserToRootInSystemd(
      context.userInfo.user
    )
  }
}
