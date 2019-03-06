import { Migrations, Migrator } from '../migrator'
import CopyMigration from '../migration/copy-migration'

module.exports = {
  up: (migrator: Migrator, migrations: Migrations) => {
    if (migrator.migrateConfig.port == 'pelion') {
      migrations['.pelion-connector'] = new CopyMigration(
        '.pelion-connector',
        migrator.migrateConfig['portBasePath'],
        migrator.migrateConfig['newPortBasePath'],
        migrator
      )
    }
  },
  down: () => {}
}
