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

  private _hasVersion(
    versions: AgentVersion[],
    version: AgentVersion
  ): boolean {
    let found = false
    for (let i = 0; i < versions.length; i++) {
      if (versions[i].equals(version)) {
        found = true
        break
      }
    }
    return found
  }

  private _getVersionsHaveMigration(
    migrationFiles: string[],
    start: AgentVersion,
    end: AgentVersion
  ): AgentVersion[] {
    let versions: AgentVersion[] = []
    migrationFiles.map(file => {
      const fileName = path.basename(file)
      if (path.extname(fileName).toLowerCase() === '.js') {
        const version = fileName.slice(0, -3)
        const migrationVersion = AgentVersion.parse(version.split('-')[0])
        if (
          migrationVersion &&
          migrationVersion.greaterThan(start) &&
          !migrationVersion.greaterThan(end)
        ) {
          if (!this._hasVersion(versions, migrationVersion)) {
            versions.push(migrationVersion)
          }
        }
      }
    })
    return versions
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
    context: MigrateContext,
    migrationFiles: string[]
  ): Promise<Migration> {
    const migrations: Migration = {}
    for (let index = 0; index < migrationFiles.length; index++) {
      const migration = await import(migrationFiles[index])
      migration.up(context, migrations)
    }
    return migrations
  }

  /*
    The migration file will be added in under `migrations` folder for each version (if apply) incrementally.
    Thus, we do not keep a snapshot migrations for each version. The migration file name always starts 
    with agent version number while being added in, followed by description of this migration. This 
    naming rule is assumed and the version number will be picked up by migrator to decide if it should 
    apply this migration in certian scenario. The migrations between two versions will be generated using
    these files.

    An example:
    * Say we have migration files for version 2.3.0, 2.4.0 and 2.4.1.
    * We are trying to update agent from 2.4.0 to 2.5.0

    As a result of the generation, migration files for 2.3.0 and 2.4.0 will be used to generate migrations that
    have been done in 2.4.0, this will give us a `current` state of the migrations that should be done. Then
    2.3.0, 2.4.0, 2.4.1 will be used to generate intermediate migrations. The desired state in the intermediate
    migrations is the final expected state after migration, but the current state will be replace to the desired 
    state of migrations that have been done (which we have generated eailer).
  */
  private async _createMigrationsBetweenTwoVersions(
    olderAgentVersion: AgentVersion,
    newerAgentVersion: AgentVersion,
    context: MigrateContext
  ): Promise<Migration> {
    try {
      const migrationFilePath = this._config.getString('MIGRATION_FILE_PATH')
      let migrationFiles = fs.readdirSync(migrationFilePath).sort()
      migrationFiles = migrationFiles.map(file => {
        return path.resolve(migrationFilePath, file)
      })

      /* we set the 'new project' path same as 'project' path, thus the absolute path generated  */
      /* in desired state in migrations that have been done will be under 'project' path which */
      /* would be easier for using as currentState of migrations */
      const configWithSamePorjectPath = {
        ...context,
        newProjectPath: context.projectPath,
        newNodeRedPath: context.nodeRedPath,
        newPortBasePath: context.portBasePath
      }
      const migrationsHavebeenDoneInOlderVersion = await this._createMigrations(
        configWithSamePorjectPath,
        this._getMigrationFilesUpTo(migrationFiles, olderAgentVersion)
      )
      const migrations = await this._createMigrations(
        context,
        this._getMigrationFilesUpTo(migrationFiles, newerAgentVersion)
      )
      for (const migrationObject of Object.entries(migrations)) {
        const key = migrationObject[0]
        /* set the `currentState` state of the migrations to be done to the `desiredState` state of */
        /* the ‘newest’ migrations that have been done */
        if (migrationsHavebeenDoneInOlderVersion[key]) {
          migrations[key].currentState =
            migrationsHavebeenDoneInOlderVersion[key].desiredState
        }
      }
      console.log(migrations)
      return migrations
    } catch (err) {
      throw new Error(`Apply migration files failed: ${err.message}`)
    }
  }

  private async _createFileChangeMigrationOps(
    config: MigrateContext,
    migrationFiles: string[]
  ): Promise<Migration> {
    const fileChangeMigrationOps: Migration = {}
    for (let index = 0; index < migrationFiles.length; index++) {
      const migration = await import(migrationFiles[index])
      migration.up(config, fileChangeMigrationOps)
    }
    for (const ops of Object.entries(fileChangeMigrationOps)) {
      const key = ops[0]
      if (ops[1].desiredState.type != 'copy') {
        delete fileChangeMigrationOps[key]
      }
    }
    return fileChangeMigrationOps
  }

  private async _createMigrationForVersion(
    version: AgentVersion,
    context: MigrateContext,
    sameProjectPathInConfig: boolean
  ): Promise<Migration> {
    try {
      const migrationFilePath = this._config.getString('MIGRATION_FILE_PATH')
      let migrationFiles = fs.readdirSync(migrationFilePath).sort()
      migrationFiles = migrationFiles.map(file => {
        return path.resolve(migrationFilePath, file)
      })

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
      const migrationsOps = await this._createFileChangeMigrationOps(
        migrateContext,
        this._getMigrationFilesUpTo(migrationFiles, version)
      )

      // TODO apply

      return migrationsOps
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
      console.log(ops)
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

        const migrationFilePath = this._config.getString('MIGRATION_FILE_PATH')
        let migrationFiles = fs.readdirSync(migrationFilePath).sort()
        migrationFiles = migrationFiles.map(file => {
          return path.resolve(migrationFilePath, file)
        })

        console.log(migrationFiles)
        const versions = this._getVersionsHaveMigration(
          migrationFiles,
          agentInfo.version,
          newAgentInfo.version
        )
        if (versions.length < 1) {
          // no migration.
          return
        }
        versions.unshift(agentInfo.version)
        for (let index = 0; index < versions.length - 1; index++) {
          this._log.debug(
            `Run migration ${versions[index]} => ${versions[index + 1]}`
          )
          const migration = await this._createMigrationsBetweenTwoVersions(
            versions[index],
            versions[index + 1],
            migrateContext
          )
          await this._runMigration(migration, migrateContext)
          this._migrations.push(migration)
        }
      }
    )
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
