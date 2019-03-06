import { Migrations, Migrator } from '../../../src/migrator'
import CopyMigration from '../../../src/migration/copy-migration'
import AwsiotConfigMigration from '../../../src/migration/awsiot-config-migration'

module.exports = {
  up: (migrator: Migrator, migrations: Migrations) => {
    migrations['.enebular-config.json'] = new CopyMigration(
      '.enebular-config.json',
      migrator.migrateConfig['portBasePath'],
      migrator.migrateConfig['newPortBasePath'],
      migrator,
      true // might not be created yet
    )

    migrations['.node-red-config'] = new CopyMigration(
      '.node-red-config',
      migrator.migrateConfig['nodeRedPath'],
      migrator.migrateConfig['newNodeRedPath'],
      migrator
    )

    migrations['.enebular-assets.json'] = new CopyMigration(
      '.enebular-assets.json',
      migrator.migrateConfig['portBasePath'],
      migrator.migrateConfig['newPortBasePath'],
      migrator,
      true // might not be created yet
    )

    migrations['assets'] = new CopyMigration(
      'assets',
      migrator.migrateConfig['portBasePath'],
      migrator.migrateConfig['newPortBasePath'],
      migrator,
      true // might not be created yet
    )

    if (migrator.migrateConfig.port == 'awsiot') {
      migrations['config.json'] = new AwsiotConfigMigration(
        'config.json',
        migrator.migrateConfig['portBasePath'],
        migrator.migrateConfig['newPortBasePath'],
        migrator
      )
    }
  },
  down: () => {}
}
