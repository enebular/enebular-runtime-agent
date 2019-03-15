import { Migration, MigrateContext } from '../../../src/migrator'
import ContextDependCopy from '../../../src/migration-ops/context-depend-copy'
import NodeJSMigration from '../../../src/migration-ops/nodejs-migration'

module.exports = {
  up: (config: MigrateContext, migration: Migration) => {
    migration['assets'] = new ContextDependCopy(
      'assets',
      (context: MigrateContext, copyOps: ContextDependCopy) => {
        copyOps.updatePath(
          `${context['portBasePath']}/assets`,
          `${context['newProjectPath']}/assets`
        )
      },
      true // might not be created yet
    )

    migration['nodejs'] = new NodeJSMigration(
      `nodejs 9.2.1 => 10.2.0`,
      '9.2.1',
      '10.2.0'
    )
  },
  down: () => {}
}
