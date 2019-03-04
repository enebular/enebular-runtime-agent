import * as fs from 'fs'
import * as path from 'path'

import AgentInfo from './agent-info'
import { UserInfo, Utils } from './utils'
import Config from './config'
import Log from './log'
import Migration from './migration/migration'
import CopyMigration from './migration/copy-migration'
import AwsiotConfigMigration from './migration/awsiot-config-migration'

export interface MigratorIf {
  migrate(): Promise<boolean>
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

  public constructor(
    agentInfo: AgentInfo,
    newAgentInfo: AgentInfo,
    config: Config,
    log: Log,
    userInfo: UserInfo
  ) {
    this._config = config
    this._log = log
    this._userInfo = userInfo

    if (!agentInfo.systemd) {
      throw new Error(`Failed to detect enebular-agent port type`)
    }
    if (!agentInfo.version || !newAgentInfo.version) {
      throw new Error(`Failed to detect enebular-agent version`)
    }

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

  public get migrateConfig(): MigrateConfig {
    return this._migrateConfig
  }

  private async _applyMigrationFiles(migrations: Migrations): Promise<boolean> {
    let migrationFiles
    try {
      // TODO: read from enebular-runtime-agent
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
      // TODO: up/down migration according to version
      migration.up(this._migrateConfig, migrations)
    }
    return true
  }

  public async migrate(): Promise<boolean> {
    let migrations: Migrations = {
      '.enebular-config.json': new CopyMigration(
        '.enebular-config.json',
        'portBasePath',
        'newPortBasePath',
        this
      ),
      '.node-red-config': new CopyMigration(
        '.node-red-config',
        'nodeRedPath',
        'newNodeRedPath',
        this
      ),
      '.enebular-assets.json': new CopyMigration(
        '.enebular-assets.json',
        'portBasePath',
        'newPortBasePath',
        this,
        true // might not be created yet
      ),
      assets: new CopyMigration(
        'assets',
        'portBasePath',
        'newPortBasePath',
        this,
        true // might not be created yet
      )
    }
    if (this._migrateConfig.port == 'awsiot') {
      migrations['config.json'] = new AwsiotConfigMigration(
        'config.json',
        'portBasePath',
        'newPortBasePath',
        this
      )
    }
    if (this._migrateConfig.port == 'pelion') {
      migrations['.pelion-connector'] = new CopyMigration(
        '.pelion-connector',
        'portBasePath',
        'newPortBasePath',
        this
      )
    }

    await this._applyMigrationFiles(migrations)

    for (const migrationObject of Object.entries(migrations)) {
      const name = migrationObject[0]
      const migration = migrationObject[1]
      await Utils.taskAsync(
        `Migrating ${name}`,
        this._log,
        async (): Promise<{}> => {
          return migration._do()
        },
        migration.optional
      )
    }
    return true
  }
}

export default Migrator
