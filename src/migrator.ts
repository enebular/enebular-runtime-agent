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
  migrate(): Promise<void>
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
  private _migrateConfig: MigrateConfig
  private _agentInfo: AgentInfo
  private _newAgentInfo: AgentInfo
  private _system: SystemIf
  private _upgrade: boolean
  private _migrations: Migrations = {}

  public constructor(
    system: SystemIf,
    agentInfo: AgentInfo,
    newAgentInfo: AgentInfo,
    config: Config,
    log: Log,
    userInfo: UserInfo
  ) {
    this._system = system
    this._config = config
    this._log = log
    this._userInfo = userInfo
    this._agentInfo = agentInfo
    this._newAgentInfo = newAgentInfo

    if (!agentInfo.systemd) {
      throw new Error(`Failed to detect enebular-agent port type`)
    }
    if (!agentInfo.version || !newAgentInfo.version) {
      throw new Error(`Failed to detect enebular-agent version`)
    }

    this._upgrade = newAgentInfo.version.greaterThan(agentInfo.version)
    const port = agentInfo.systemd.port
    this._migrateConfig = {
      user: this._userInfo.user,
      port: port,
      projectPath: agentInfo.path,
      nodeRedPath: `${agentInfo.path}/node-red`,
      portBasePath: `${agentInfo.path}/ports/${port}`,
      newProjectPath: newAgentInfo.path,
      newNodeRedPath: `${newAgentInfo.path}/node-red`,
      newPortBasePath: `${newAgentInfo.path}/ports/${port}`
    }
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

  public get migrateConfig(): MigrateConfig {
    return this._migrateConfig
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

  private async _applyMigrationFiles(migrations: Migrations): Promise<void> {
    let migrationFiles
    const migrationFilePath = this._config.getString('MIGRATION_FILE_PATH')

    try {
      // TODO: read from enebular-runtime-agent not updater ?
      migrationFiles = fs.readdirSync(migrationFilePath)

      const tmp = { 
        ...this._migrateConfig,
        newProjectPath: this._migrateConfig.projectPath,
        newNodeRedPath: this._migrateConfig.nodeRedPath,
        newPortBasePath: this._migrateConfig.portBasePath
      }

      let currentStates: Migrations = {}
      await this._importMigrations(
        currentStates,
        tmp,
        migrationFilePath,
        this._filterMigrationFiles(
          migrationFiles,
          new AgentVersion(0, 0, 0),
          this._agentInfo.version
        )
      )
      this._log.debug(currentStates)
      await this._importMigrations(
        migrations,
        this._migrateConfig,
        migrationFilePath,
        this._filterMigrationFiles(
          migrationFiles,
          new AgentVersion(0, 0, 0),
          this._newAgentInfo.version
        )
      )
      this._log.debug(migrations)

      for (const migrationObject of Object.entries(migrations)) {
        const key = migrationObject[0]
        if (currentStates[key]) {
          migrations[key].currentState = currentStates[key].deserveState
        }
      }
      this._log.debug(migrations)
    } catch (err) {
      throw new Error(`Apply migration files failed: ${err.message}`)
    }
  }

  public async migrate(): Promise<void> {
    if (!this._upgrade) {
      throw new Error(`Migrator only supports upgrade.`)
    }

    if (this._agentInfo.nodejsVersion !== this._newAgentInfo.nodejsVersion) {
      this._migrations['nodejs'] = new NodeJSMigration(
        `nodejs ${this._agentInfo.nodejsVersion} => ${
          this._newAgentInfo.nodejsVersion
        }`,
        this._agentInfo.nodejsVersion,
        this._newAgentInfo.nodejsVersion
      )
    }

    await this._applyMigrationFiles(this._migrations)

    for (const migrationObject of Object.entries(this._migrations)) {
      const migration = migrationObject[1]
      await Utils.taskAsync(
        `Migrating ${migration.name}`,
        this._log,
        async (): Promise<void> => {
          return migration._do(this)
        },
        migration.optional
      )
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
            if (migration.reverse) migration.reverse(this)
          },
          migration.optional
        )
      }
    }
  }
}

export default Migrator
