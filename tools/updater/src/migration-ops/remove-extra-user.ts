import { MigrationOp, MigrationOpState } from './migration-op'
import { MigrateContext } from '../migrator'

export default class RemoveExtraUser extends MigrationOp {
  public constructor(
    name: string,
    optional = false
  ) {
    super(name, { type: 'remove extra user' }, { type: 'remove extra user' }, optional)
  }

  public do(context: MigrateContext): void {
    context.system.removeExtraUserInSystemd(context.userInfo.user)
  }
}
