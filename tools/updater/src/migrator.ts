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

  /* example:  */
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
      if (path.extname(file).toLowerCase() === '.js') {
        let version = file.slice(0, -3)
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

  private async _importMigrations(
    migrations: Migrations,
    config: MigrateConfig,
    migrationFilePath: string,
    migrationFiles: string[]
  ): Promise<void> {
    for (let index = 0; index < migrationFiles.length; index++) {
      const migration = await import(path.resolve(
        migrationFilePath,
        migrationFiles[index]
      ))
      migration.up(config, migrations)
    }
  }

  private async _applyMigrationFiles(
    agentInfo: AgentInfo,
    newAgentInfo: AgentInfo,
    config: MigrateConfig
  ): Promise<void> {
    let migrationFiles
    const migrationFilePath = this._config.getString('MIGRATION_FILE_PATH')

    try {
      // TODO: read from enebular-runtime-agent not updater ?
      migrationFiles = fs.readdirSync(migrationFilePath)
      const calcCurrentStateConfig = {
        ...config,
        newProjectPath: config.projectPath,
        newNodeRedPath: config.nodeRedPath,
        newPortBasePath: config.portBasePath
      }

      let currentStates: Migrations = {}
      await this._importMigrations(
        currentStates,
        calcCurrentStateConfig,
        migrationFilePath,
        this._filterMigrationFiles(
          migrationFiles,
          new AgentVersion(0, 0, 0),
          agentInfo.version
        )
      )
      await this._importMigrations(
        this._migrations,
        config,
        migrationFilePath,
        this._filterMigrationFiles(
          migrationFiles,
          new AgentVersion(0, 0, 0),
          newAgentInfo.version
        )
      )
      for (const migrationObject of Object.entries(this._migrations)) {
        const key = migrationObject[0]
        if (currentStates[key]) {
          this._migrations[key].currentState = currentStates[key].deserveState
        }
      }
    } catch (err) {
      throw new Error(`Apply migration files failed: ${err.message}`)
    }
  }

  public async migrate(
    agentInfo: AgentInfo,
    newAgentInfo: AgentInfo
  ): Promise<void> {
    await Utils.taskAsync(
      `Pre-migrating check`,
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

        if (agentInfo.nodejsVersion !== newAgentInfo.nodejsVersion) {
          this._migrations['nodejs'] = new NodeJSMigration(
            `nodejs ${agentInfo.nodejsVersion} => ${
              newAgentInfo.nodejsVersion
            }`,
            agentInfo.nodejsVersion,
            newAgentInfo.nodejsVersion
          )
        }
        return this._applyMigrationFiles(agentInfo, newAgentInfo, migrateConfig)
      }
    )

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
