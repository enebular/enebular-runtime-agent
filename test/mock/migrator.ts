import { MigratorIf } from '../../src/migrator'

export default class MockMigrator implements MigratorIf {
  public failMigrate = false

  public async migrate(): Promise<boolean> {
    if (this.failMigrate) {
      throw new Error('migrate failed.')
    }
    return true
  }
}
