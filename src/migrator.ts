import * as fs from 'fs'
import * as path from 'path'

import AgentInfo from './agent-info'
import { UserInfo, default as Utils } from './utils'
import Config from './config'
import Log from './log'

export abstract class Migration {
  protected _name: string
  protected _type: string

  protected constructor(name: string, type: string) {
    this._name = name
    this._type = type
  }
  public abstract _do(): Promise<{}>
}

export class CopyMigration extends Migration {
  protected _copyFrom: string
  protected _copyTo: string
  protected _migrator: Migrator

  public constructor(
    name: string,
    copyFrom: string,
    copyTo: string,
    migrator: Migrator
  ) {
    super(name, 'copy')
    this._name = name
    this._migrator = migrator
    this._copyFrom = migrator.migrateConfig[copyFrom]
    this._copyTo = migrator.migrateConfig[copyTo]
  }

  public async _do(): Promise<{}> {
    return Utils.copy(
      this._migrator.log,
      `${this._copyFrom}/${this._name}`,
      `${this._copyTo}/${this._name}`,
      this._migrator.userInfo
    )
  }
}

export class AwsiotConfigMigration extends CopyMigration {
  public constructor(
    name: string,
    copyFrom: string,
    copyTo: string,
    migrator: Migrator
  ) {
    super(name, copyFrom, copyTo, migrator)
    this._type = 'copy-awsiot-config'
  }

  public async _do(): Promise<{}> {
    const awsiotConfigPath = path.resolve(this._copyFrom, this._name)
    const awsiotConfig = JSON.parse(fs.readFileSync(awsiotConfigPath, 'utf8'))

    // TODO: check isAbsolute path
    const filesToCopy = [
      this._name,
      awsiotConfig.caCert,
      awsiotConfig.clientCert,
      awsiotConfig.privateKey
    ]

    let promises: Promise<{}>[] = []
    filesToCopy.forEach(file => {
      promises.push(
        Utils.copy(
          this._migrator.log,
          path.resolve(this._copyFrom, file),
          path.resolve(this._copyTo, file),
          this._migrator.userInfo
        )
      )
    })
    return Promise.all(promises)
  }
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

export default class Migrator {
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

    if (!agentInfo.awsiot && !agentInfo.pelion) {
      throw new Error(`Failed to detect enebular-agent port type`)
    }
    if (!agentInfo.version || !newAgentInfo.version) {
      throw new Error(`Failed to detect enebular-agent version`)
    }

    const port = agentInfo.awsiot ? 'awsiot' : 'pelion'
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

  private _applyMigrationFiles(migrations: Migrations): boolean {
    let migrationFiles
    try {
      migrationFiles = fs.readdirSync(path.resolve(__dirname, './migrations'))
      migrationFiles = migrationFiles.filter(file => {
        return path.extname(file).toLowerCase() === '.js'
      })
      // TODO: find version specific migrations only
    } catch (err) {
      return false
    }
    migrationFiles.forEach(file => {
      const current = require(path.resolve(__dirname, './migrations/', file))
      // TODO: up/down migration according to version
      current.up(this._migrateConfig, migrations)
    })
    return true
  }

  private async _resolveConfigs(port: string): Promise<boolean> {
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
        this
      ),
      assets: new CopyMigration(
        'assets',
        'portBasePath',
        'newPortBasePath',
        this
      )
    }
    if (port == 'awsiot') {
      migrations['config.json'] = new AwsiotConfigMigration(
        'config.json',
        'portBasePath',
        'newPortBasePath',
        this
      )
    }
    if (port == 'pelion') {
      migrations['.pelion-connector'] = new CopyMigration(
        '.pelion-connector',
        'portBasePath',
        'newPortBasePath',
        this
      )
    }

    this._applyMigrationFiles(migrations)

    for (const migrationObject of Object.entries(migrations)) {
      const name = migrationObject[0]
      const migration = migrationObject[1]
      await Utils.taskAsync(
        `Migrating ${name} ...`,
        this._log,
        (): Promise<{}> => {
          return migration._do()
        }
      )
    }
    return true
  }

  public async migrate(): Promise<boolean> {
    try {
      await this._resolveConfigs(this._migrateConfig.port)
    } catch (err) {
      throw new Error(`Failed to resolve config files:\n${err.message}`)
    }
    return true
  }
}
