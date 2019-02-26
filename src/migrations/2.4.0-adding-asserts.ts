import { Migrations, MigrateConfig } from '../migrator'

module.exports = {
  up: (config: MigrateConfig, migrations: Migrations) => {
    delete migrations['assets']
    delete migrations['.enebular-assets.json']
  }
}
