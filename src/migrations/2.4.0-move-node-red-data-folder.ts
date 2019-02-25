import { Migrations, MigrateConfig } from '../migrator'

module.exports = {
  up: (config: MigrateConfig, migrations: Migrations) =>
  {
    migrations['.node-red-config'].copyFrom = `${config.projectPath}/node-red/.node-red-config`

    delete migrations['assets']
    delete migrations['.enebular-assets.json']
  }
}


