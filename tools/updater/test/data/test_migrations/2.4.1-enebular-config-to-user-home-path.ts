import { Migration, MigrateContext } from '../../../src/migrator'
import Copy from '../../../src/migration-ops/copy'
import AwsiotConfigCopy from '../../../src/migration-ops/awsiot-config-copy'

module.exports = {
  up: (context: MigrateContext, migration: Migration) => {
    migration['.enebular-config.json'] = new Copy(
      'enebular-agent config file',
      `${context['portBasePath']}/.enebular-config.json`,
      `/home/${context.userInfo.user}/.enebular-agent/.enebular-config.json`,
      true // might not be created yet
    )
    migration['.node-red-config'] = new Copy(
      'Node-RED data directory',
      `${context['nodeRedPath']}/.node-red-config`,
      `${context['newNodeRedPath']}/.node-red-config`
    )
    migration['.enebular-assets.json'] = new Copy(
      'Assets config file',
      `${context['projectPath']}/.enebular-assets.json`,
      `${context['newProjectPath']}/.enebular-assets.json`,
      true // might not be created yet
    )
    migration['assets'] = new Copy(
      'Assets data directory',
      `${context['projectPath']}/assets`,
      `${context['newProjectPath']}/assets`,
      true // might not be created yet
    )

    if (context.port == 'awsiot') {
      migration['config.json'] = new AwsiotConfigCopy(
        'AWSIoT config files',
        `${context['portBasePath']}/config.json`,
        `${context['newPortBasePath']}/config.json`
      )
    }
    if (context.port == 'pelion') {
      migration['.pelion-connector'] = new Copy(
        '.pelion-connector',
        `${context['portBasePath']}/.pelion-connector`,
        `${context['newPortBasePath']}/.pelion-connector`
      )
    }
  },
  down: () => {}
}
