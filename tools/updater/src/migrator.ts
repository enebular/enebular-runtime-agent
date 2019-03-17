import * as fs from 'fs'
import * as path from 'path'

import AgentInfo from './agent-info'
import AgentVersion from './agent-version'
import { UserInfo, Utils } from './utils'
import Config from './config'
import Log from './log'
import MigrationOps from './migration-ops/migration-ops'
import { SystemIf } from './system'

export interface MigratorIf {
  migrate(agentInfo: AgentInfo, newAgentInfo: AgentInfo): Promise<void>
  reverse(): Promise<void>
}

export interface Migration {
  [key: string]: MigrationOps
}

export interface MigrateContext {
  log: Log
  userInfo: UserInfo
  system: SystemIf
  port: string
  projectPath: string
  nodeRedPath: string
  portBasePath: string
  newProjectPath: string
  newNodeRedPath: string
  newPortBasePath: string
}

export class Migrator implements MigratorIf {
  private _config: Config
  private _log: Log
  private _userInfo: UserInfo
  private _system: SystemIf
  private _migrations: Migration[] = []

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

  private _getMigrationFilesBetweenTwoVersions(
    migrationFiles: string[],
    start: AgentVersion,
    end: AgentVersion
  ): string[] {
    return migrationFiles.filter(file => {
      const fileName = path.basename(file)
      if (path.extname(fileName).toLowerCase() === '.js') {
        const version = fileName.slice(0, -3)
        const migrationVersion = AgentVersion.parse(version.split('-')[0])
        if (migrationVersion) {
          if (start.equals(end) && migrationVersion.equals(start)) {
            return true
          }
          if (migrationVersion.greaterThan(start) && !migrationVersion.greaterThan(end)) {
            return true
          }
        }
      }
      return false
    })
  }

  private async _createMigrationFromFile(
    file: string,
    context: MigrateContext,
    sameProjectPathInConfig: boolean
  ): Promise<Migration> {
    try {
      /* we set the 'new project' path same as 'project' path, thus the absolute path generated  */
      /* in desired state in migrations that have been done will be under 'project' path which */
      /* would be easier for using as currentState of migrations */
      const contextWithSamePorjectPath = {
        ...context,
        projectPath: context.newProjectPath,
        nodeRedPath: context.newNodeRedPath,
        portBasePath: context.newPortBasePath
      }
      const migrateContext = sameProjectPathInConfig
        ? contextWithSamePorjectPath
        : context

      const migration: Migration = {}
      const migrationFile = await import(file)
      migrationFile.up(migrateContext, migration)
      return migration
    } catch (err) {
      throw new Error(`Apply migration files failed: ${err.message}`)
    }
  }

  private async _runMigration(
    migration: Migration,
    context: MigrateContext
  ): Promise<void> {
    for (const ops of Object.values(migration)) {
      await Utils.taskAsync(
        `Migrating ${ops.name}`,
        this._log,
        async (): Promise<void> => {
          return ops.do(context)
        },
        ops.optional
      )
      ops.done = true
    }
  }

  private async _reverseMigration(migration: Migration): Promise<void> {
    for (const ops of Object.values(migration)) {
      if (ops.reverse) {
        await Utils.taskAsync(
          `[RESTORE] Migration ${ops.name}`,
          this._log,
          async (): Promise<void> => {
            if (ops.reverse && ops.done) ops.reverse()
          },
          ops.optional
        )
      }
    }
  }

  public async migrate(
    agentInfo: AgentInfo,
    newAgentInfo: AgentInfo
  ): Promise<void> {
    let migrationFilesToRun
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
        const migrationFilePath = this._config.getString('MIGRATION_FILE_PATH')
        let migrationFiles = fs.readdirSync(migrationFilePath).sort()
        migrationFiles = migrationFiles.map(file => {
          return path.resolve(migrationFilePath, file)
        })

        migrationFilesToRun = this._getMigrationFilesBetweenTwoVersions(
          migrationFiles,
          agentInfo.version,
          newAgentInfo.version
        )
      }
    )
    if (migrationFilesToRun.length < 1) {
      // no migration.
      return
    }
    const port = agentInfo.detectPortType()
    const migrateContext = {
      userInfo: this._userInfo,
      system: this._system,
      log: this._log,
      port: port,
      projectPath: agentInfo.path,
      nodeRedPath: `${agentInfo.path}/node-red`,
      portBasePath: `${agentInfo.path}/ports/${port}`,
      newProjectPath: newAgentInfo.path,
      newNodeRedPath: `${newAgentInfo.path}/node-red`,
      newPortBasePath: `${newAgentInfo.path}/ports/${port}`
    }

    for (let index = 0; index < migrationFilesToRun.length; index++) {
      this._log.debug(`Run migration ${path.basename(migrationFilesToRun[index])}`)
      const migration = await this._createMigrationFromFile(
        migrationFilesToRun[index],
        migrateContext,
        index != 0
      )
      await this._runMigration(migration, migrateContext)
      this._migrations.push(migration)
    }
  }

  public async reverse(): Promise<void> {
    let migration = this._migrations.pop()
    while (migration != undefined) {
      await this._reverseMigration(migration)
      migration = this._migrations.pop()
    }
  }
}

export default Migrator
