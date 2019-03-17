import { Migration, MigrateContext } from '../migrator'
import Copy from '../migration-ops/copy'
import AwsiotConfigCopy from '../migration-ops/awsiot-config-copy'

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
      'Assets config file',
      `${context['portBasePath']}/.enebular-assets.json`,
      `${context['newPortBasePath']}/.enebular-assets.json`,
      true // might not be created yet
    )
    migration['assets'] = new Copy(
      'Assets data directory',
      `${context['portBasePath']}/assets`,
      `${context['newPortBasePath']}/assets`,
      true // might not be created yet
    )
    if (context.port == 'awsiot') {
      migration['config.json'] = new AwsiotConfigCopy(
        'AWSIoT config files',
        `${context['portBasePath']}/config.json`,
        `${context['newPortBasePath']}/config.json`
      )
    }
  },
  down: () => {}
}
