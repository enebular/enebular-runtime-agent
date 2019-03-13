import * as fs from 'fs'
import * as path from 'path'

import AgentInfo from './agent-info'
import AgentVersion from './agent-version'
import { UserInfo, Utils } from './utils'
import Config from './config'
import Log from './log'
import Migration from './migration/migration'
import NodeJSMigration from './migration/nodejs-migration'
import { SystemIf } from './system'

export interface MigratorIf {
  migrate(agentInfo: AgentInfo, newAgentInfo: AgentInfo): Promise<void>
  reverse(): Promise<void>
}

export interface Migrations {
  [key: string]: Migration
}

export interface MigrateConfig {
  projectPath: string
  nodeRedPath: string
  portBasePath: string
  newProjectPath: string
  newNodeRedPath: string
  newPortBasePath: string
  port: string
  user: string
}

export class Migrator implements MigratorIf {
  private _config: Config
  private _log: Log
  private _userInfo: UserInfo
  private _system: SystemIf
  private _migrations: Migrations = {}

  public constructor(
    system: SystemIf,
    config: Config,
    log: Log,
    userInfo: UserInfo
  ) {
    this._system = system
    this._config = config
    this._log = log
    this._userInfo = userInfo
  }

  public get log(): Log {
    return this._log
  }

  public get userInfo(): UserInfo {
    return this._userInfo
  }

  public get system(): SystemIf {
    return this._system
  }

  /* examples:  */
  /* file list: [2.3.0, 2.4.0, 2.4.1] */
  /* if start = 2.3.0 end = 2.4.0, return list = [2.4.0] */
  /* if start = 2.4.0 end = 2.4.1, return list = [2.4.1] */
  /* if start = 0.0.0 end = 2.4.0, return list = [2.3.0, 2.4.0] */
  private _filterMigrationFiles(
    migrationFiles: string[],
    start: AgentVersion,
    end: AgentVersion
  ): string[] {
    return migrationFiles.filter(file => {
      const fileName = path.basename(file)
      if (path.extname(fileName).toLowerCase() === '.js') {
        let version = fileName.slice(0, -3)
        const migrationVersion = AgentVersion.parse(version.split('-')[0])
        if (
          migrationVersion &&
          !migrationVersion.greaterThan(end) &&
          migrationVersion.greaterThan(start)
        ) {
          return true
        }
      }
      return false
    })
  }

  private _getMigrationFilesUpTo(
    migrationFiles: string[],
    version: AgentVersion
  ): string[] {
    return this._filterMigrationFiles(
      migrationFiles,
      new AgentVersion(0, 0, 0),
      version
    )
  }

  private async _createMigrations(
    config: MigrateConfig,
    migrationFiles: string[]
  ): Promise<Migrations> {
    const migrations: Migrations = {}
    for (let index = 0; index < migrationFiles.length; index++) {
      const migration = await import(migrationFiles[index])
      migration.up(config, migrations)
    }
    return migrations
  }

  private async _createCurrentMigrations(
    currentAgentVersion: AgentVersion,
    newAgentVersion: AgentVersion,
    config: MigrateConfig
  ): Promise<Migrations> {
    const migrationFilePath = this._config.getString('MIGRATION_FILE_PATH')

    try {
      let migrationFiles = fs.readdirSync(migrationFilePath).sort()
      migrationFiles = migrationFiles.map(file => {
        return path.resolve(migrationFilePath, file)
      })

      /* we set the 'new project' path same as 'project' path, thus the absolute path generated  */
      /* in desired state in migrations that have been done will be under 'project' path which */
      /* would be easier for using as currentState of current migrations */
      const configWithSamePorjectPath = {
        ...config,
        newProjectPath: config.projectPath,
        newNodeRedPath: config.nodeRedPath,
        newPortBasePath: config.portBasePath
      }
      const migrationsHavebeenDoneInCurrentVersion = await this._createMigrations(
        configWithSamePorjectPath,
        this._getMigrationFilesUpTo(migrationFiles, currentAgentVersion)
      )
      const migrations = await this._createMigrations(
        config,
        this._getMigrationFilesUpTo(migrationFiles, newAgentVersion)
      )
      for (const migrationObject of Object.entries(migrations)) {
        const key = migrationObject[0]
        /* set the `currentState` state of the migrations to be done to the `desiredState` state of */
        /* the ‘newest’ migrations that have been done */
        if (migrationsHavebeenDoneInCurrentVersion[key]) {
          migrations[key].currentState =
            migrationsHavebeenDoneInCurrentVersion[key].desiredState
        }
      }
      return migrations
    } catch (err) {
      throw new Error(`Apply migration files failed: ${err.message}`)
    }
  }

  public async migrate(
    agentInfo: AgentInfo,
    newAgentInfo: AgentInfo
  ): Promise<void> {
    await Utils.taskAsync(
      `Pre-migration check`,
      this._log,
      async (): Promise<void> => {
        if (!agentInfo.version || !newAgentInfo.version) {
          throw new Error(`Failed to detect enebular-agent version`)
        }
        if (newAgentInfo.version.lessThan(agentInfo.version)) {
          throw new Error(`Migration only supports upgrade.`)
        }
        const port = agentInfo.detectPortType()
        const migrateConfig = {
          user: this._userInfo.user,
          port: port,
          projectPath: agentInfo.path,
          nodeRedPath: `${agentInfo.path}/node-red`,
          portBasePath: `${agentInfo.path}/ports/${port}`,
          newProjectPath: newAgentInfo.path,
          newNodeRedPath: `${newAgentInfo.path}/node-red`,
          newPortBasePath: `${newAgentInfo.path}/ports/${port}`
        }

        this._migrations = await this._createCurrentMigrations(
          agentInfo.version,
          newAgentInfo.version,
          migrateConfig
        )
        if (agentInfo.nodejsVersion !== newAgentInfo.nodejsVersion) {
          this._migrations['nodejs'] = new NodeJSMigration(
            `nodejs ${agentInfo.nodejsVersion} => ${
              newAgentInfo.nodejsVersion
            }`,
            agentInfo.nodejsVersion,
            newAgentInfo.nodejsVersion
          )
        }
      }
    )

    console.log(this._migrations)

    for (const migrationObject of Object.entries(this._migrations)) {
      const migration = migrationObject[1]
      await Utils.taskAsync(
        `Migrating ${migration.name}`,
        this._log,
        async (): Promise<void> => {
          return migration.do(this)
        },
        migration.optional
      )
      migration.done = true
    }
  }

  public async reverse(): Promise<void> {
    for (const migrationObject of Object.entries(this._migrations)) {
      const migration = migrationObject[1]
      if (migration.reverse) {
        await Utils.taskAsync(
          `[RESTORE] Migration ${migration.name}`,
          this._log,
          async (): Promise<void> => {
            if (migration.reverse && migration.done) migration.reverse(this)
          },
          migration.optional
        )
      }
    }
  }
}

export default Migrator
