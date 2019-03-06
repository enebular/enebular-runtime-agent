import { MigratorIf } from '../../src/migrator'

export default class MockMigrator implements MigratorIf {
  public failMigrate = false
  public failReverse = false

  public async migrate(): Promise<void> {
    if (this.failMigrate) {
      throw new Error('migrate failed.')
    }
  }

  public async reverse(): Promise<void> {
    if (this.failReverse) {
      throw new Error('Reverse migration failed.')
    }
  }
}
