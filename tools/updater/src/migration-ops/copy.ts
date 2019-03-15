import { MigrationOps, MigrationOpsState } from './migration-ops'
import { MigrateContext } from '../migrator'
import Utils from '../utils'

export interface CopyState extends MigrationOpsState {
  path: string
}

export class Copy extends MigrationOps {
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

  public async do(context: MigrateContext): Promise<void> {
    return Utils.copy(
      context.log,
      `${(this._currentState as CopyState).path}`,
      `${(this._desiredState as CopyState).path}`,
      context.userInfo
    )
  }
}

export default Copy
