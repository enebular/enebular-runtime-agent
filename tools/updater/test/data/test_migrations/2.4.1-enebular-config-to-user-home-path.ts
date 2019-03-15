import { Migration, MigrateContext } from '../../../src/migrator'
import ContextDependCopy from '../../../src/migration-ops/context-depend-copy'

module.exports = {
  up: (config: MigrateContext, migration: Migration) => {
    migration['.enebular-config.json'] = new ContextDependCopy(
      '.enebular-config.json',
      (context: MigrateContext, copyOps: ContextDependCopy) => {
        copyOps.updatePath(
          `${context['portBasePath']}/.enebular-config.json`,
          `/home/${config.userInfo.user}/.enebular-agent/.enebular-config.json`
        )
      },
      true // might not be created yet
    )

    if (config.port == 'pelion') {
      migration['.pelion-connector'] = new ContextDependCopy(
        '.pelion-connector',
        (context: MigrateContext, copyOps: ContextDependCopy) => {
          copyOps.updatePath(
            `${context['portBasePath']}/.pelion-connector`,
            `${context['newPortBasePath']}/.pelion-connector`
          )
        }
      )
    }
  },
  down: () => {}
}
