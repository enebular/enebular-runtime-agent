import * as fs from 'fs'
import * as path from 'path'

import AgentInfo from './agent-info'
import { UserInfo, Utils } from './utils'
import Config from './config'
import Log from './log'
import Migration from './migration/migration'
import CopyMigration from './migration/copy-migration'
import AwsiotConfigMigration from './migration/awsiot-config-migration'
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

  private async _applyMigrationFiles(migrations: Migrations): Promise<boolean> {
    let migrationFiles
    try {
      // TODO: read from enebular-runtime-agent not updater ?
      migrationFiles = fs.readdirSync(path.resolve(__dirname, './migrations'))
      migrationFiles = migrationFiles.filter(file => {
        return path.extname(file).toLowerCase() === '.js'
      })
      // TODO: find version specific migrations only
    } catch (err) {
      return false
    }

    for (let index = 0; index < migrationFiles.length; index++) {
      const migration = await import(path.resolve(
        __dirname,
        './migrations/',
        migrationFiles[index]
      ))
      if (this._upgrade) {
        migration.up(this._migrateConfig, migrations)
      } else {
        migration.down(this._migrateConfig, migrations)
      }
    }
    return true
  }

  public async migrate(): Promise<void> {
    this._migrations = {
      '.enebular-config.json': new CopyMigration(
        '.enebular-config.json',
        this._migrateConfig['portBasePath'],
        this._migrateConfig['newPortBasePath'],
        this,
        true // might not be created yet
      ),
      '.node-red-config': new CopyMigration(
        '.node-red-config',
        this._migrateConfig['nodeRedPath'],
        this._migrateConfig['newNodeRedPath'],
        this
      ),
      '.enebular-assets.json': new CopyMigration(
        '.enebular-assets.json',
        this._migrateConfig['portBasePath'],
        this._migrateConfig['newPortBasePath'],
        this,
        true // might not be created yet
      ),
      assets: new CopyMigration(
        'assets',
        this._migrateConfig['portBasePath'],
        this._migrateConfig['newPortBasePath'],
        this,
        true // might not be created yet
      )
    }
    if (this._migrateConfig.port == 'awsiot') {
      this._migrations['config.json'] = new AwsiotConfigMigration(
        'config.json',
        this._migrateConfig['portBasePath'],
        this._migrateConfig['newPortBasePath'],
        this
      )
    }
    if (this._migrateConfig.port == 'pelion') {
      this._migrations['.pelion-connector'] = new CopyMigration(
        '.pelion-connector',
        this._migrateConfig['portBasePath'],
        this._migrateConfig['newPortBasePath'],
        this
      )
    }
    if (this._agentInfo.nodejsVersion !== this._newAgentInfo.nodejsVersion) {
      this._migrations['nodejs'] = new NodeJSMigration(
        `nodejs ${this._agentInfo.nodejsVersion} => ${
          this._newAgentInfo.nodejsVersion
        }`,
        this._agentInfo.nodejsVersion,
        this._newAgentInfo.nodejsVersion,
        this
      )
    }

    await this._applyMigrationFiles(this._migrations)

    for (const migrationObject of Object.entries(this._migrations)) {
      const migration = migrationObject[1]
      await Utils.taskAsync(
        `Migrating ${migration.name}`,
        this._log,
        async (): Promise<void> => {
          return migration._do()
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
            if (migration.reverse) migration.reverse()
          },
          migration.optional
        )
      }
    }
  }
}

export default Migrator
