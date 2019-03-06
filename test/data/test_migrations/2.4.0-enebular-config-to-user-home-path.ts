import { Migrations, Migrator } from '../../../src/migrator'
import CopyMigration from '../../../src/migration/copy-migration'

module.exports = {
  up: (migrator: Migrator, migrations: Migrations) => {
    migrations['.enebular-config.json'] = new CopyMigration(
      '.enebular-config.json',
      migrator.migrateConfig['portBasePath'],
      `/home/${migrator.userInfo.user}/.enebular-agent`,
      migrator,
      true // might not be created yet
    )
  },
  down: () => {}
}
