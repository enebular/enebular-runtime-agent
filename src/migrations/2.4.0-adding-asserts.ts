import { Migrations, MigrateConfig } from '../migrator'

module.exports = {
  up: (config: MigrateConfig, migrations: Migrations) => {
    // we don't migrate assets data
    delete migrations['assets']
    delete migrations['.enebular-assets.json']
  },
  down: (config: MigrateConfig, migrations: Migrations) => {
    // we don't migrate assets data
    delete migrations['assets']
    delete migrations['.enebular-assets.json']
  }
}
