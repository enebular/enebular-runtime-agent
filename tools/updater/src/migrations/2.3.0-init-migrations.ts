import { Migrations, MigrateConfig } from '../migrator'
import CopyMigration from '../migration/copy-migration'
import AwsiotConfigMigration from '../migration/awsiot-config-migration'

module.exports = {
  up: (config: MigrateConfig, migrations: Migrations) => {
    migrations['.enebular-config.json'] = new CopyMigration(
      '.enebular-config.json',
      config['portBasePath'],
      config['newPortBasePath'],
      true // might not be created yet
    )

    migrations['.node-red-config'] = new CopyMigration(
      '.node-red-config',
      config['nodeRedPath'],
      config['newNodeRedPath']
    )

    migrations['.enebular-assets.json'] = new CopyMigration(
      '.enebular-assets.json',
      config['portBasePath'],
      config['newPortBasePath'],
      true // might not be created yet
    )

    migrations['assets'] = new CopyMigration(
      'assets',
      config['portBasePath'],
      config['newPortBasePath'],
      true // might not be created yet
    )

    if (config.port == 'awsiot') {
      migrations['config.json'] = new AwsiotConfigMigration(
        'config.json',
        config['portBasePath'],
        config['newPortBasePath']
      )
    }
  },
  down: () => {}
}
