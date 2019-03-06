import { Migrations, Migrator } from '../../../src/migrator'
import CopyMigration from '../../../src/migration/copy-migration'

module.exports = {
  up: (migrator: Migrator, migrations: Migrations) => {
    migrations['.enebular-assets.json'] = new CopyMigration(
      '.enebular-assets.json',
      migrator.migrateConfig['portBasePath'],
      migrator.migrateConfig['newProjectPath'],
      migrator,
      true // might not be created yet
    )
  },
  down: () => {}
}
