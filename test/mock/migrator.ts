import { MigratorIf } from '../../src/migrator'

export default class MockMigrator implements MigratorIf {
  public failMigrate = false

  public async migrate(): Promise<void> {
    if (this.failMigrate) {
      throw new Error('migrate failed.')
    }
  }
}
