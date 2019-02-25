import * as fs from 'fs'
import * as path from 'path'

import AgentInfo from './agent-info'
import Utils from './utils'
import Config from './config'
import Log from './log'

export interface CopyMigration extends Migration {
  copyFrom: string
  copyTo: string
}

export interface Migration {
  type: string
}

export interface Migrations {
  [key: string]: CopyMigration
}

export default class Migrator {
  private _config: Config
  private _log: Log
  private _user: string
  private _userId: {
    gid: number
    uid: number
  }
  private _projectPath: string = ''
  private _portBasePath: string = ''
  private _newProjectPath: string = ''
  private _newPortBasePath: string = ''
  private _port = ''

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
    config: Config,
    log: Log,
    user: string
  ) {
    this._config = config
    this._log = log
    this._user = user
    this._userId = Utils.getUserId(user)
  }

  private async _resolveConfigs(port: string): Promise<boolean> {
    let configs = this._standardConfigs
    if (port == 'awsiot') configs = configs.concat(this._awsiotConfigs)
    if (port == 'pelion') configs = configs.concat(this._pelionConfigs)

    let migrations = {} as Migrations
    for (const config of configs) { 
      migrations[config] = {
        type: 'copy',
        copyFrom: `${this._portBasePath}/${config}`,
        copyTo: `${this._newPortBasePath}/${config}`,
      }
    }

    let migrationFiles
    try {
      migrationFiles = fs.readdirSync(path.resolve(__dirname, './migrations'))
      migrationFiles = migrationFiles.filter((file) => {
        return path.extname(file).toLowerCase() === '.js'
      })
      // TODO: find version specific migrations only
    }
    catch (err) {
      console.log(err)
    }
    migrationFiles.forEach((file) => {
      const current = require(path.resolve(__dirname, './migrations/', file))
      // TODO: up/down migration according to version
      current.up(this._projectPath, migrations)
    })

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

  public async migrate(agentInfo: AgentInfo, newAgentInfo: AgentInfo): Promise<boolean> {
    if (!agentInfo.awsiot && !agentInfo.pelion) {
      throw new Error(`Failed to detect enebular-agent port type`)
    }
    if (!agentInfo.version || !newAgentInfo.version) {
      throw new Error(`Failed to detect enebular-agent version`)
    }

    const port = agentInfo.awsiot ? "awsiot" : "pelion"
    this._projectPath = agentInfo.path
    this._portBasePath = `${agentInfo.path}/ports/${port}`
    this._newProjectPath = newAgentInfo.path
    this._newPortBasePath = `${newAgentInfo.path}/ports/${port}`

    try {
      await this._resolveConfigs(port)
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
      uid: this._userId.uid,
      gid: this._userId.gid
    })
  }

  private _copyConfig(relativePath: string): Promise<{}> {
    const src = `${this._portBasePath}/${relativePath}`
    const dst = `${this._newPortBasePath}/${relativePath}`
    return this._copy(src, dst)
  }
}
