import { Migrations, MigrateConfig } from '../../../src/migrator'
import CopyMigration from '../../../src/migration/copy-migration'

module.exports = {
  up: (config: MigrateConfig, migrations: Migrations) => {
    migrations['.enebular-config.json'] = new CopyMigration(
      '.enebular-config.json',
      config['portBasePath'],
      `/home/${config.user}/.enebular-agent`,
      true // might not be created yet
    )
  },
  down: () => {}
}
