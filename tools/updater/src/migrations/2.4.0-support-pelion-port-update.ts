import { Migrations, MigrateConfig } from '../migrator'
import CopyMigration from '../migration/copy-migration'

module.exports = {
  up: (config: MigrateConfig, migrations: Migrations) => {
    if (config.port == 'pelion') {
      migrations['.pelion-connector'] = new CopyMigration(
        '.pelion-connector',
        config['portBasePath'],
        config['newPortBasePath']
      )
    }
  },
  down: () => {}
}
