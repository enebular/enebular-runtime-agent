import { Migrations, MigrateConfig } from '../../../src/migrator'
import CopyMigration from '../../../src/migration/copy-migration'

module.exports = {
  up: (config: MigrateConfig, migrations: Migrations) => {
    migrations['.enebular-assets.json'] = new CopyMigration(
      '.enebular-assets.json',
      config['portBasePath'],
      config['newProjectPath'],
      true // might not be created yet
    )
  },
  down: () => {}
}
