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

  private _agentSwitched = false

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
    const cachePath = this._config.isOverridden(
      'ENEBULAR_AGENT_UPDATER_CACHE_DIR'
    )
      ? this._config.getString('ENEBULAR_AGENT_UPDATER_CACHE_DIR')
      : `/home/${this._userInfo.user}`
    this._oldAgentBackupPath = path.resolve(
      cachePath,
      `./enebular-runtime-agent.old`
    )
    this._newAgentInstallPath = path.resolve(
      cachePath,
      `./enebular-runtime-agent.new`
    )
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

  private _logRootUserExecInfo(user: string): void {
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

  private _getServiceName(): string {
    return `enebular-agent-${this._userInfo.user}`
  }

  private _removeNewAgent(): void {
    if (fs.existsSync(this._newAgentInstallPath)) {
      rimraf.sync(this._newAgentInstallPath)
    }
  }

  private _stopAgent(newAgent = false): Promise<boolean> {
    return this._system.stopAgent(this._getServiceName(), newAgent)
  }

  private async _startAgent(
    version: AgentVersion,
    path: string,
    newAgent = true
  ): Promise<void> {
    const prefix = newAgent ? '' : '[RESTORE] '
    await Utils.taskAsync(
      `${prefix}Starting enebular-agent ${version}`,
      this._log,
      (): Promise<boolean> => {
        return this._system.startAgent(this._getServiceName(), newAgent)
      }
    )

    return Utils.taskAsync(
      `${prefix}Verifying enebular-agent ${version} started`,
      this._log,
      async (): Promise<boolean> => {
        if (
          await this.checkIfAgentDead(
            this._getServiceName(),
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
      // TODO: this won't be needed once we've added `show mode`command line option to mbed-cloud-counnector
      if (
        !agentInfo.version.greaterThan(new AgentVersion(2, 4, 0)) &&
        !this._config.isOverridden('PELION_MODE')
      ) {
        throw new Error(
          `Updating enebular-agent pelion port in 2.4.0 requires --pelion-mode to be set (developer or factory)`
        )
      }
    }
  }

  private async _configAndStartNewAgent(
    agentInfo: AgentInfo,
    newAgentInfo: AgentInfo,
    oldAgentBackupPath: string
  ): Promise<void> {
    if (agentInfo.isServiceActive()) {
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
        return this._system.flipToNewAgent(
          newAgentInfo.path,
          agentInfo.path,
          oldAgentBackupPath
        )
      }
    )

    this._agentSwitched = true
    if (agentInfo.isServiceRegistered()) {
      await this._startAgent(newAgentInfo.version, agentInfo.path)
    }
  }

  private async _postInstall(
    agentInfo: AgentInfo,
    newAgentInfo: AgentInfo
  ): Promise<void> {
    await this._installer.build(agentInfo, newAgentInfo, this._userInfo)

    try {
      await this._configAndStartNewAgent(
        agentInfo,
        newAgentInfo,
        this._oldAgentBackupPath
      )
    } catch (err) {
      const version = agentInfo.version
      const newVersion = newAgentInfo.version
      // restore
      try {
        if (this._agentSwitched) {
          try {
            this._log.debug(
              `Start enebular-agent failed, status from journal:\n` +
                this._system.getServiceLogIgnoreError(
                  this._getServiceName(),
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

        if (agentInfo.isServiceRegistered()) {
          await this._startAgent(version, agentInfo.path, false)
        }
      } catch (err1) {
        throw new Error(
          err.message +
            ` [Faulty] restore to ${version} failed! error message: ${
              err1.message
            }`
        )
      }
      throw err
    }
  }

  public async update(): Promise<boolean> {
    this._log.info('enebular-agent-updater version: ' + updaterVer)

    const user = this._userInfo.user
    if (this._config.getBoolean('ROOT_REQUIRED') && process.getuid() !== 0) {
      this._logRootUserExecInfo(
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
        try {
          agentInfo = await AgentInfo.createFromSystemd(this._system, user)
        } catch (err) {
          if (err.agentPath && fs.existsSync(this._oldAgentBackupPath)) {
            // Found a previous cached agent, restore it.
            try {
              await Utils.mv(this._oldAgentBackupPath, err.agentPath)
            } catch (err) {
              throw new Error(
                `Failed to restore agent from ${this._oldAgentBackupPath} to ${
                  err.agentPath
                }: ${err.message}`
              )
            }
            // retry it
            agentInfo = await AgentInfo.createFromSystemd(this._system, user)
          } else {
            throw err
          }
        }
      },
      // If user specified install path, the systemd failure can be ignored.
      this._config.isOverridden('ENEBULAR_AGENT_INSTALL_DIR')
    )

    if (
      agentInfo &&
      this._config.isOverridden('ENEBULAR_AGENT_INSTALL_DIR') &&
      agentInfo.path != agentPath
    ) {
      throw new Error(
        `Registered systemd service path (${
          agentInfo.path
        }) under ${user} is differnet from specified path (${agentPath}).`
      )
    }

    if (!agentInfo) {
      Utils.task(
        `Checking enebular-agent by path`,
        this._log,
        (): void => {
          agentInfo = AgentInfo.createFromSource(this._system, agentPath)
        }
      )
    }

    agentInfo.prettyStatus(this._log)

    await this._installer.download(this._newAgentInstallPath, this._userInfo)
    const newAgentInfo = AgentInfo.createFromSource(
      this._system,
      this._newAgentInstallPath
    )
    this._preUpdateCheck(newAgentInfo, agentInfo)

    if (
      newAgentInfo.version.equals(agentInfo.version) &&
      !this._config.getBoolean('FORCE_UPDATE')
    ) {
      this._log.info(
        `enebular-agent is already the latest version (${agentInfo.version})`
      )
      this._removeNewAgent()
      // No need to start the agent if it is not registered
      // No need to start the agent if it is active
      if (agentInfo.isServiceRegistered() && !agentInfo.isServiceActive()) {
        // we will only try to start agent if it is not started, since the current version may have
        // a rare chance was a updated version without being started.
        // TODO: should we follow another restore here.
        await this._startAgent(agentInfo.version, agentInfo.path)
      }
      return true
    }

    await this._postInstall(agentInfo, newAgentInfo)

    if (fs.existsSync(this._oldAgentBackupPath)) {
      rimraf.sync(this._oldAgentBackupPath)
    }
    this._log.info(Utils.echoGreen('Update succeeded ✔'))
    return true
  }

  public async cancel(): Promise<boolean> {
    this._log.info(Utils.echoYellow('Update canceled ✔'))
    this._removeNewAgent()
    return true
  }
}
