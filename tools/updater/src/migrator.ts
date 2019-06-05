import * as fs from 'fs'
import * as path from 'path'

import AgentInfo from './agent-info'
import AgentVersion from './agent-version'
import { UserInfo, Utils } from './utils'
import Config from './config'
import Log from './log'
import MigrationOp from './migration-ops/migration-op'
import { SystemIf } from './system'

/*
 * For each release, a migration file under '[SRC]/migrations' is expected to be added.
 * The file name has to follow the rule that it will always start with the version number,
 * then the description can be added following with a '-' separator (If apply). For example:
 * 2.3.0.ts
 * 2.3.1-change-assets-data-config.ts
 * 2.4.0.ts
 */
export interface MigratorIf {
  migrate(agentInfo: AgentInfo, newAgentInfo: AgentInfo): Promise<void>
  reverse(): Promise<void>
}

export interface Migration {
  [position: number]: MigrationOp
  length: number
  push(item: MigrationOp): number
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
    return migrationFiles.filter(
      (file): boolean => {
        const fileName = path.basename(file)
        if (path.extname(fileName).toLowerCase() === '.js') {
          const version = fileName.slice(0, -3)
          const migrationVersion = AgentVersion.parse(version.split('-')[0])
          if (migrationVersion) {
            // We allow same version force update.
            if (start.equals(end) && migrationVersion.equals(start)) {
              return true
            }
            if (
              migrationVersion.greaterThan(start) &&
              migrationVersion.lessThanOrEquals(end)
            ) {
              return true
            }
          }
        }
        return false
      }
    )
  }

  private async _createMigrationFromFile(
    file: string,
    context: MigrateContext,
    sameProjectPathInConfig: boolean
  ): Promise<Migration> {
    try {
      const contextWithSamePorjectPath = {
        ...context,
        projectPath: context.newProjectPath,
        nodeRedPath: context.newNodeRedPath,
        portBasePath: context.newPortBasePath
      }
      const migrateContext = sameProjectPathInConfig
        ? contextWithSamePorjectPath
        : context

      const migration: Migration = []
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
    for (let i = 0; i < migration.length; i++) {
      const op = migration[i]
      await Utils.taskAsync(
        `Migrating ${op.name}`,
        this._log,
        async (): Promise<void> => {
          return op.do(context)
        },
        op.optional
      )
      op.done = true
    }
  }

  private async _reverseMigration(migration: Migration): Promise<void> {
    for (let i = 0; i < migration.length; i++) {
      const op = migration[i]
      if (op.reverse) {
        await Utils.taskAsync(
          `[RESTORE] Migration ${op.name}`,
          this._log,
          async (): Promise<void> => {
            if (op.reverse && op.done) op.reverse()
          },
          op.optional
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
        migrationFiles = migrationFiles.map(
          (file): string => {
            return path.resolve(migrationFilePath, file)
          }
        )

        migrationFilesToRun = this._getMigrationFilesBetweenTwoVersions(
          migrationFiles,
          agentInfo.version,
          newAgentInfo.version
        )
        const fileForNewVersion = migrationFilesToRun.filter(
          (file): boolean =>
            path.basename(file).startsWith(newAgentInfo.version.toString())
        )
        if (fileForNewVersion.length < 1) {
          throw new Error(
            `No migration file found for ${newAgentInfo.version}.`
          )
        }
      }
    )
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
      this._log.debug(
        `Run migration ${path.basename(migrationFilesToRun[index])}`
      )
      const migration = await this._createMigrationFromFile(
        migrationFilesToRun[index],
        migrateContext,
        /*
         * We set the project base path to be the same path (new project path) in all the subsequent migration. This is because of
         * excepting the first migration, all the other migrations will be executed from the new project base path to new prokect
         * base path. The copy operation itself will handle the copying with the same source and destination.
         */
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
