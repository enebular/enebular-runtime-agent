import { Migration, MigrateContext } from '../../../src/migrator'
import Helper from '../../../src/migration-ops/helper'
import NodeJSChange from '../../../src/migration-ops/nodejs-change'

module.exports = {
  up: (context: MigrateContext, migration: Migration) => {
    Helper.addFileCopy(
      migration,
      Helper.KEY_ENEBULAR_CONFIG,  
      'enebular-agent config file',
      `${context['portBasePath']}/.enebular-config.json`,
      `${context['newPortBasePath']}/.enebular-config.json`,
      true // might not be created yet
    )
    Helper.addFileCopy(
      migration,
      Helper.KEY_NODE_RED_DATA,  
      'Node-RED data directory',
      `${context['nodeRedPath']}/.node-red-config`,
      `${context['newNodeRedPath']}/.node-red-config`
    )
    Helper.addFileCopy(
      migration,
      Helper.KEY_ASSETS_CONFIG,  
      'Assets config file',
      `${context['portBasePath']}/.enebular-assets.json`,
      `${context['newProjectPath']}/.enebular-assets.json`,
      true // might not be created yet
    )
    Helper.addFileCopy(
      migration,
      Helper.KEY_ASSETS_DATA,  
      'Assets data directory',
      `${context['portBasePath']}/assets`,
      `${context['newProjectPath']}/assets`,
      true // might not be created yet
    )
    if (context.port == 'awsiot') {
      Helper.addAWSIoTConfigFileCopy(
        migration,
        `${context['portBasePath']}/config.json`,
        `${context['newPortBasePath']}/config.json`
      )
    }
    Helper.addNodeJSChange(migration, '9.2.1', '10.2.0')
  },
  down: () => {}
}
