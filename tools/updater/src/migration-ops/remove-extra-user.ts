import { MigrationOp, MigrationOpState } from './migration-op'
import { MigrateContext } from '../migrator'

export default class RemoveExtraUser extends MigrationOp {
  public constructor(
    name: string,
    optional = false
  ) {
    super(name, { type: 'remove extra user' }, { type: 'remove extra user' }, optional)
  }

  public async do(context: MigrateContext): Promise<void> {
    return context.system.removeExtraUserInSystemd(context.userInfo.user)
  }
}
