import { Migration, MigrateContext } from '../../../src/migrator'
import ContextDependCopy from '../../../src/migration-ops/context-depend-copy'

module.exports = {
  up: (config: MigrateContext, migration: Migration) => {
    migration['.enebular-assets.json'] = new ContextDependCopy(
      '.enebular-assets.json',
      (context: MigrateContext, copyOps: ContextDependCopy) => {
        copyOps.updatePath(
          `${context['portBasePath']}/.enebular-assets.json`,
          `${context['newProjectPath']}/.enebular-assets.json`
        )
      },
      true // might not be created yet
    )
  },
  down: () => {}
}
