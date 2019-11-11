import { Migration, MigrateContext } from '../../../src/migrator'
import Helper from '../../../src/migration-ops/helper'

module.exports = {
  up: (context: MigrateContext, migration: Migration) => {
    Helper.addRunAsRoot(migration)
  },
  down: () => {}
}
