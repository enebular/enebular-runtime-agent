import CommandLine from './command-line'
import Config from './config'
import Log from './log'
import AgentInfo from './agent-info'
import AgentVersion from './agent-version'
import { AgentInstaller, AgentInstallerIf } from './agent-installer'
import { Migrator, MigratorIf } from './migrator'
import { System, SystemIf } from './system'
import { UserInfo, Utils } from './utils'
import { version as updaterVer } from '../package.json'
import * as path from 'path'
import * as fs from 'fs'
import * as rimraf from 'rimraf'

export default class AgentUpdater {
  private _commandLine: CommandLine
  private _config: Config
  private _log: Log
  private _system: SystemIf
  private _installer: AgentInstallerIf
  private _migrator: MigratorIf
  private _userInfo: UserInfo
  private _oldAgentBackupPath: string
  private _newAgentInstallPath: string

  private _restoreAgentOnFailure = false
  private _switchAgentOnFailure = false

  public constructor(
    system?: SystemIf,
    installer?: AgentInstallerIf,
    migrator?: MigratorIf
  ) {
    this._config = new Config()
    this._config.importConfigStrings(process.env)

    this._commandLine = new CommandLine(this._config)
    this._commandLine.parse()
    this._config.importConfigAnyTypes(this._commandLine.getConfigOptions())

    this._log = new Log(
      this._config.getString('DEBUG'),
      this._config.getBoolean('ENEBULAR_AGENT_UPDATER_ENABLE_LOG')
    )

    this._userInfo = Utils.getUserInfo(
      this._config.getString('ENEBULAR_AGENT_USER')
    )
    const cachePath = `/home/${this._userInfo.user}`
    this._oldAgentBackupPath = path.resolve(cachePath, `./enebular-runtime-agent.old`)
    this._newAgentInstallPath = path.resolve(cachePath, `./enebular-runtime-agent.new`)
    this._system = system ? system : new System(this._log)
    this._installer = installer
      ? installer
      : new AgentInstaller(this._config, this._log, this._system)
    this._migrator = migrator
      ? migrator
      : new Migrator(this._system, this._config, this._log, this._userInfo)
  }

  public getLogFilePath(): string {
    return this._log.getLogFilePath()
  }

  private _requireRootUser(user: string): void {
    this._log.info(
      'To update enebular-agent, copy/paste the following command:'
    )

    let appendEnvs = ''
    const overriddenItems = this._config.getOverriddenItems()
    const itemKeys = Object.keys(overriddenItems)
    itemKeys.forEach(key => {
      if (key !== 'ENEBULAR_AGENT_USER')
        appendEnvs = appendEnvs + ` ${key}='${overriddenItems[key].value}'`
    })

    this._log.info(
      'sudo env PATH=$PATH:' +
        path.dirname(process.execPath) +
        appendEnvs +
        ' ' +
        process.argv[1] +
        ` --user=${user}`
    )
  }

  private checkIfAgentDead(
    serviceName: string,
    initDelay: number,
    timeout: number,
    newAgent: boolean
  ): Promise<boolean> {
    return Utils.polling(
      async (): Promise<boolean> => {
        return this._system.isAgentDead(serviceName, newAgent)
      },
      initDelay,
      1000,
      timeout
    )
  }

  private _stopAgent(newAgent = false): Promise<boolean> {
    const serviceName = `enebular-agent-${this._userInfo.user}`
    return this._system.stopAgent(serviceName, newAgent)
  }

  private async _startAgent(
    version: AgentVersion,
    path: string,
    newAgent = true
  ): Promise<void> {
    const serviceName = `enebular-agent-${this._userInfo.user}`
    const prefix = newAgent ? '' : '[RESTORE] '
    await Utils.taskAsync(
      `${prefix}Starting enebular-agent ${version}`,
      this._log,
      (): Promise<boolean> => {
        return this._system.startAgent(serviceName, newAgent)
      }
    )

    return Utils.taskAsync(
      `${prefix}Verifying enebular-agent ${version}`,
      this._log,
      async (): Promise<boolean> => {
        if (
          await this.checkIfAgentDead(
            serviceName,
            2000,
            this._config.getNumber('MINIMUM_CHECKING_TIME') * 1000,
            newAgent
          )
        ) {
          throw new Error(`Verification failed, ${version} failed to start!`)
        }
        return true
      }
    )
  }

  private _preUpdateCheck(newAgentInfo: AgentInfo, agentInfo: AgentInfo): void {
    if (
      newAgentInfo.version.lessThan(agentInfo.version) &&
      !this._config.getBoolean('FORCE_UPDATE')
    ) {
      throw new Error(
        `Downgrading enebular-agent is not supported yet. (${
          agentInfo.version
        } => ${newAgentInfo.version})`
      )
    }
    if (agentInfo.version.lessThan(new AgentVersion(2, 3, 0))) {
      throw new Error(`Only support updating enebular-agent 2.3.0 and above`)
    }
    if (agentInfo.detectPortType() == 'pelion') {
      if (agentInfo.version.lessThan(new AgentVersion(2, 4, 0))) {
        throw new Error(
          `Updating enebular-agent pelion port is only supported from version 2.4.0`
        )
      }
      if (
        !agentInfo.version.greaterThan(new AgentVersion(2, 4, 0)) &&
        !this._config.isOverridden('PELION_MODE')
      ) {
        throw new Error(
          `Updating enebular-agent pelion port in 2.4.0 requires to set --pelion-mode (developer or factory)`
        )
      }
    }
  }

  private async _setupAndStartNewAgant(
    agentInfo: AgentInfo,
    newAgentInfo: AgentInfo,
    oldAgentBackupPath: string
  ): Promise<void> {
    await this._installer.build(agentInfo, newAgentInfo, this._userInfo)
    this._restoreAgentOnFailure = true
    // shutdown current agent
    if (agentInfo.systemd && agentInfo.systemd.active) {
      await Utils.taskAsync(
        `Stopping enebular-agent ${agentInfo.version}`,
        this._log,
        (): Promise<boolean> => {
          return this._stopAgent()
        }
      )
    }
    // migrate enebular-agent and systemd config
    await this._migrator.migrate(agentInfo, newAgentInfo)

    await Utils.taskAsync(
      `Switching enebular-agent from ${agentInfo.version} to ${
        newAgentInfo.version
      }`,
      this._log,
      (): Promise<boolean> => {
        if (fs.existsSync(oldAgentBackupPath)) {
          rimraf.sync(oldAgentBackupPath)
        }
        return this._system.flipToNewAgent(
          newAgentInfo.path,
          agentInfo.path,
          oldAgentBackupPath
        )
      }
    )

    this._switchAgentOnFailure = true
    if (agentInfo.systemd) {
      await this._startAgent(newAgentInfo.version, agentInfo.path)
    }
  }

  private async _postInstall(
    agentInfo: AgentInfo,
    newAgentInfo: AgentInfo
  ): Promise<void> {
    this._preUpdateCheck(newAgentInfo, agentInfo)

    if (
      newAgentInfo.version.equals(agentInfo.version) &&
      !this._config.getBoolean('FORCE_UPDATE')
    ) {
      this._log.info(
        `enebular-agent is already the latest (${agentInfo.version}) version`
      )
      // No need to start the agent if it is not registered
      if (!agentInfo.systemd) return
      // No need to start the agent if it is active
      if (agentInfo.systemd && agentInfo.systemd.active) return
      // we will only try to start agent if it is not started, since the current version may have
      // a rare chance was a updated version without being started.
      return this._startAgent(agentInfo.version, agentInfo.path)
    }

    this._log.info(
      'Updating ' +
        Utils.echoGreen(`${agentInfo.version}`) +
        ' to ' +
        Utils.echoGreen(`${newAgentInfo.version}`)
    )

    try {
      await this._setupAndStartNewAgant(
        agentInfo,
        newAgentInfo,
        this._oldAgentBackupPath
      )
    } catch (err) {
      if (this._restoreAgentOnFailure) {
        const version = agentInfo.version
        const newVersion = newAgentInfo.version
        // restore
        try {
          if (this._switchAgentOnFailure) {
            try {
              this._log.debug(
                `Start enebular-agent failed, status from journal:\n` +
                  this._system.getServiceLogIgnoreError(
                    `enebular-agent-${this._userInfo.user}`,
                    100
                  )
              )
            } catch (err) {
              // ignore error if we have
            }

            await Utils.taskAsync(
              `[RESTORE] Stopping enebular-agent ${newVersion}`,
              this._log,
              (): Promise<boolean> => {
                return this._stopAgent(true)
              },
              true
            )

            await Utils.taskAsync(
              `[RESTORE] Flipping back to enebular-agent ${version}`,
              this._log,
              (): Promise<boolean> => {
                return this._system.flipToOriginalAgent(
                  this._oldAgentBackupPath,
                  agentInfo.path,
                  newAgentInfo.path
                )
              }
            )
          }

          await this._migrator.reverse()

          if (agentInfo.systemd) {
            await this._startAgent(version, agentInfo.path, false)
          }
        } catch (err1) {
          throw new Error(
            err.message +
              `\n[Faulty] restore to ${version} failed! error message:\n${
                err1.message
              }`
          )
        }
      }
      throw err
    }
  }

  public async update(): Promise<boolean> {
    this._log.info('enebular-agent-updater version: ' + updaterVer)

    const user = this._userInfo.user
    if (this._config.getBoolean('ROOT_REQUIRED') && process.getuid() !== 0) {
      this._requireRootUser(
        this._config.isOverridden('ENEBULAR_AGENT_USER')
          ? user
          : process.env.USER || user
      )
      throw new Error('You have to run this with root permission.')
    }

    let agentInfo
    const agentPath = this._config.getString('ENEBULAR_AGENT_INSTALL_DIR')
    await Utils.taskAsync(
      'Checking enebular-agent in systemd',
      this._log,
      async (): Promise<void> => {
        agentInfo = await AgentInfo.createFromSystemd(this._system, user, this._oldAgentBackupPath)
      },
      true
    )

    if (!agentInfo) {
      Utils.task(
        `Checking enebular-agent by path`,
        this._log,
        (): void => {
          agentInfo = AgentInfo.createFromSrc(this._system, agentPath)
        }
      )
    }

    if (
      this._config.isOverridden('ENEBULAR_AGENT_INSTALL_DIR') &&
      agentInfo.path != agentPath
    ) {
      throw new Error(
        `Registered systemd service path (${
          agentInfo.path
        }) under ${user} is differnet from specified path (${agentPath}).`
      )
    }

    agentInfo.prettyStatus(this._log)

    const newAgentInfo = await this._installer.install(
      this._newAgentInstallPath,
      this._userInfo
    )
    try {
      await this._postInstall(agentInfo, newAgentInfo)
    } catch (err) {
      if (fs.existsSync(this._newAgentInstallPath)) {
        rimraf.sync(this._newAgentInstallPath)
      }
      throw err
    }

    if (fs.existsSync(this._oldAgentBackupPath)) {
      rimraf.sync(this._oldAgentBackupPath)
    }
    this._log.info(Utils.echoGreen('Update succeed ✔'))
    return true
  }

  public async cancel(): Promise<boolean> {
    this._log.info(Utils.echoYellow('Update canceled ✔'))
    if (fs.existsSync(this._newAgentInstallPath)) {
      rimraf.sync(this._newAgentInstallPath)
    }
    return true
  }
}
