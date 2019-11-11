import { Migration, MigrateContext } from '../migrator'
import Helper from '../migration-ops/helper'

module.exports = {
  up: (context: MigrateContext, migration: Migration): void => {
    Helper.addFileCopy(
      migration,
      'enebular-agent config file',
      `${context['portBasePath']}/.enebular-config.json`,
      `${context['newPortBasePath']}/.enebular-config.json`,
      true // might not be created yet
    )
    Helper.addFileCopy(
      migration,
      'enebular-agent activation config file',
      `${context['portBasePath']}/.enebular-activation-config.json`,
      `${context['newPortBasePath']}/.enebular-activation-config.json`,
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
      `${context['portBasePath']}/.enebular-assets.json`,
      `${context['newPortBasePath']}/.enebular-assets.json`,
      true // might not be created yet
    )
    Helper.addFileCopy(
      migration,
      'Assets data directory',
      `${context['portBasePath']}/assets`,
      `${context['newPortBasePath']}/assets`,
      true // might not be created yet
    )
    Helper.addFileCopy(
      migration,
      'AI Models data directory',
      `${context['portBasePath']}/ai-models`,
      `${context['newPortBasePath']}/ai-models`,
      true // might not be created yet
    )
    Helper.addFileCopy(
      migration,
      'enebular-agent flow data file',
      `${context['portBasePath']}/.enebular-flow.json`,
      `${context['newPortBasePath']}/.enebular-flow.json`,
      true // might not be created yet
    )
    Helper.addFileCopy(
      migration,
      'enebular-agent monitor data file',
      `${context['portBasePath']}/.enebular-monitor.json`,
      `${context['newPortBasePath']}/.enebular-monitor.json`,
      true // might not be created yet
    )
    Helper.addFileCopy(
      migration,
      'enebular-agent AI Models data file',
      `${context['portBasePath']}/.enebular-ai-models.json`,
      `${context['newPortBasePath']}/.enebular-ai-models.json`,
      true // might not be created yet
    )
    if (context.port == 'awsiot') {
      Helper.addAWSIoTConfigFileCopy(
        migration,
        `${context['portBasePath']}/config.json`,
        `${context['newPortBasePath']}/config.json`,
        true // might not be created yet
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
    Helper.addRunAsRoot(migration)
  },
  down: (): void => {}
}
