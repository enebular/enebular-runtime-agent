import { Migration, MigrateContext } from '../../../src/migrator'
import Helper from '../../../src/migration-ops/helper'

module.exports = {
  up: (context: MigrateContext, migration: Migration) => {
    Helper.addFileCopy(
      migration,
      'enebular-agent config file',
      `${context['portBasePath']}/.enebular-config.json`,
      `/home/${context.userInfo.user}/.enebular-agent/.enebular-config.json`,
      true // might not be created yet
    )
    Helper.addFileCopy(
      migration,
      'Node-RED data directory',
      `${context['nodeRedPath']}/.node-red-config`,
      `${context['newNodeRedPath']}/.node-red-config`
    )
    Helper.addFileCopy(
      migration,
      'Assets config file',
      `${context['projectPath']}/.enebular-assets.json`,
      `${context['newProjectPath']}/.enebular-assets.json`,
      true // might not be created yet
    )
    Helper.addFileCopy(
      migration,
      'Assets data directory',
      `${context['projectPath']}/assets`,
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
    if (context.port == 'pelion') {
      Helper.addFileCopy(
        migration,
        'Pelion data directory',
        `${context['portBasePath']}/.pelion-connector`,
        `${context['newPortBasePath']}/.pelion-connector`
      )
    }
  },
  down: () => {}
}
