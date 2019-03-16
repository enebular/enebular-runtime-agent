import { Migration, MigrateContext } from '../../../src/migrator'
import Copy from '../../../src/migration-ops/copy'
import AwsiotConfigCopy from '../../../src/migration-ops/awsiot-config-copy'
import NodeJSMigration from '../../../src/migration-ops/nodejs-migration'

module.exports = {
  up: (context: MigrateContext, migration: Migration) => {
    migration['.enebular-config.json'] = new Copy(
      'enebular-agent config file',
      `${context['portBasePath']}/.enebular-config.json`,
      `${context['newPortBasePath']}/.enebular-config.json`,
      true // might not be created yet
    )
    migration['.node-red-config'] = new Copy(
      'Node-RED data directory',
      `${context['nodeRedPath']}/.node-red-config`,
      `${context['newNodeRedPath']}/.node-red-config`
    )
    migration['.enebular-assets.json'] = new Copy(
      '.enebular-assets.json',
      `${context['portBasePath']}/.enebular-assets.json`,
      `${context['newProjectPath']}/.enebular-assets.json`,
      true // might not be created yet
    )
    migration['assets'] = new Copy(
      'assets',
      `${context['portBasePath']}/assets`,
      `${context['newProjectPath']}/assets`,
      true // might not be created yet
    )

    if (context.port == 'awsiot') {
      migration['config.json'] = new AwsiotConfigCopy(
        'config.json',
        `${context['portBasePath']}/config.json`,
        `${context['newPortBasePath']}/config.json`
      )
    }

    migration['nodejs'] = new NodeJSMigration(
      `nodejs 9.2.1 => 10.2.0`,
      '9.2.1',
      '10.2.0'
    )
  },
  down: () => {}
}
