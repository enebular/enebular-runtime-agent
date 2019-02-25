import { Migrations } from '../migrator'

module.exports = {
  up: (projectPath: string, migrations: Migrations) =>
  {
    migrations['.node-red-config'].copyFrom = `${projectPath}/node-red/.node-red-config`

    delete migrations['assets']
    delete migrations['.enebular-assets.json']
  }
}


