import { Migration, MigrateContext } from '../migrator'
import Copy from '../migration-ops/copy'
import AwsiotConfigMigration from '../migration-ops/awsiot-config-migration'

module.exports = {
  up: (config: MigrateContext, migration: Migration) => {
    migration['.enebular-config.json'] = new Copy(
      '.enebular-config.json',
      config['portBasePath'],
      config['newPortBasePath'],
      true // might not be created yet
    )

    migration['.node-red-config'] = new Copy(
      '.node-red-config',
      config['nodeRedPath'],
      config['newNodeRedPath']
    )

    migration['.enebular-assets.json'] = new Copy(
      '.enebular-assets.json',
      config['portBasePath'],
      config['newPortBasePath'],
      true // might not be created yet
    )

    migration['assets'] = new Copy(
      'assets',
      config['portBasePath'],
      config['newPortBasePath'],
      true // might not be created yet
    )

    /* if (config.port == 'awsiot') { */
    /* migration['config.json'] = new AwsiotConfigMigration( */
    /* 'config.json', */
    /* config['portBasePath'], */
    /* config['newPortBasePath'] */
    /* ) */
    /* } */
  },
  down: () => {}
}
