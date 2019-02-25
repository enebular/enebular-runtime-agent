import * as fs from 'fs'
import * as path from 'path'

import AgentInfo from './agent-info'
import { UserInfo, default as Utils }  from './utils'
import Config from './config'
import Log from './log'

export class CopyMigration implements Migration {
  type: string
  copyFrom: string
  copyTo: string

  constructor(copyFrom: string, copyTo: string) {
    this.type = 'copy'
    this.copyFrom = copyFrom
    this.copyTo = copyTo
  }
}

export interface Migration {
  type: string
}

export interface Migrations {
  [key: string]: CopyMigration
}

export interface MigrateConfig {
  projectPath: string
  portBasePath: string
  newProjectPath: string
  newPortBasePath: string
  port: string
}

export default class Migrator {
  private _config: Config
  private _log: Log
  private _userInfo: UserInfo
  private _migrateConfig: MigrateConfig

  private _standardConfigs = [
    '.enebular-config.json',
    '.node-red-config',
    'assets',
    '.enebular-assets.json',
  ]

  private _awsiotConfigs = [
    'config.json',
  ]

  private _pelionConfigs = [
    '.pelion-connector',
  ]

  public constructor(
    agentInfo: AgentInfo,
    newAgentInfo: AgentInfo,
    config: Config,
    log: Log,
    userInfo: UserInfo,
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

    const port = agentInfo.awsiot ? "awsiot" : "pelion"
    this._migrateConfig = {
      port: port,
      projectPath: agentInfo.path,
      portBasePath: `${agentInfo.path}/ports/${port}`,
      newProjectPath: newAgentInfo.path,
      newPortBasePath: `${newAgentInfo.path}/ports/${port}`
    }
  }

  private _applyMigrationFiles(migrations: Migrations): boolean {
    let migrationFiles
    try {
      migrationFiles = fs.readdirSync(path.resolve(__dirname, './migrations'))
      migrationFiles = migrationFiles.filter((file) => {
        return path.extname(file).toLowerCase() === '.js'
      })
      // TODO: find version specific migrations only
    }
    catch (err) {
      return false
    }
    migrationFiles.forEach((file) => {
      const current = require(path.resolve(__dirname, './migrations/', file))
      // TODO: up/down migration according to version
      current.up(this._migrateConfig, migrations)
    })
    return true
  }

  private async _resolveConfigs(port: string): Promise<boolean> {
    let configs = this._standardConfigs
    if (port == 'pelion') configs = configs.concat(this._pelionConfigs)
    if (port == 'awsiot') {
      configs = configs.concat(this._awsiotConfigs)
    }

    let migrations = {} as Migrations
    for (const config of configs) { 
      migrations[config] = new CopyMigration(
        `${this._migrateConfig.portBasePath}/${config}`,
        `${this._migrateConfig.newPortBasePath}/${config}`,
      )
    }

    this._applyMigrationFiles(migrations)

    for (const migration of Object.entries(migrations)) { 
      const name = migration[0]
      const value = migration[1]
      switch (value.type) {
        case 'copy':
          await Utils.taskAsync(
            `Copying ${name} ...`,
            this._log,
            (): Promise<{}> => {
              return this._copy(value.copyFrom, value.copyTo)
            }
          )
          break
        default:
          break
      }
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

  private _copy(src?: string, dst?: string): Promise<{}> {
    if (!src || !dst) {
      throw new Error(`src (${src}) and dst (${dst}) must be set`)
    }
    if (!fs.existsSync(src)) {
      throw new Error(`Failed to find config: ${src}`)
    }
    let args = [src, dst]
    if (fs.lstatSync(src).isDirectory()) {
      args.unshift('-r')
    }
    return Utils.spawn('cp', args, this._log, {
      uid: this._userInfo.uid,
      gid: this._userInfo.gid
    })
  }
}
