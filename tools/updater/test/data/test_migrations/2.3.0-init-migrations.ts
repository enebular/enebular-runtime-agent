import { Migration, MigrateContext } from '../../../src/migrator'
import { ContextDependCopy } from '../../../src/migration-ops/context-depend-copy'
import AwsiotConfigMigration from '../../../src/migration-ops/awsiot-config-migration'

module.exports = {
  up: (migrateContext: MigrateContext, migration: Migration) => {
    migration['.enebular-config.json'] = new ContextDependCopy(
      'enebular-agent config file',
      (context: MigrateContext, copyOps: ContextDependCopy) => {
        copyOps.updatePath(
          `${context['portBasePath']}/.enebular-config.json`,
          `${context['newPortBasePath']}/.enebular-config.json`
        )
      },
      true // might not be created yet
    )

    migration['.node-red-config'] = new ContextDependCopy(
      'Node-RED data directory',
      (context: MigrateContext, copyOps: ContextDependCopy) => {
        copyOps.updatePath(
          `${context['nodeRedPath']}/.node-red-config`,
          `${context['newNodeRedPath']}/.node-red-config`
        )
      }
    )

    migration['.enebular-assets.json'] = new ContextDependCopy(
      'Assets config file',
      (context: MigrateContext, copyOps: ContextDependCopy) => {
        copyOps.updatePath(
          `${context['portBasePath']}/.enebular-assets.json`,
          `${context['newPortBasePath']}/.enebular-assets.json`
        )
      },
      true // might not be created yet
    )

    migration['assets'] = new ContextDependCopy(
      'Assets data directory',
      (context: MigrateContext, copyOps: ContextDependCopy) => {
        copyOps.updatePath(
          `${context['portBasePath']}/assets`,
          `${context['newPortBasePath']}/assets`
        )
      },
      true // might not be created yet
    )

    if (migrateContext.port == 'awsiot') {
      migration['config.json'] = new AwsiotConfigMigration(
        'config.json',
        (context: MigrateContext, copyOps: ContextDependCopy) => {
          copyOps.updatePath(
            `${context['portBasePath']}/config.json`,
            `${context['newPortBasePath']}/config.json`
          )
        }
      )
    }
  },
  down: () => {}
}
