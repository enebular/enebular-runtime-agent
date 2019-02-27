import Config from './config'
import CommandLine from './command-line'
import Log from './log'
import AgentInfo from './agent-info'
import AgentInstaller from './agent-installer'
import Migrator from './migrator'
import Utils from './utils'
import System from './system'
import { version as updaterVer } from '../package.json'
import * as path from 'path'
import * as fs from 'fs'
import * as rimraf from 'rimraf'

export default class AgentUpdater {
  private _minimumRunningTime: number = 30 * 1000 // 30 seconds
  private _config: Config
  private _commandLine: CommandLine
  private _log: Log
  private _system: System

  public constructor(system: System) {
    this._system = system
    this._config = new Config()
    this._config.importConfigStrings(process.env)

    this._commandLine = new CommandLine(this._config)
    this._commandLine.parse()
    this._config.importConfigAnyTypes(this._commandLine.getConfigOptions())

    this._log = new Log(
      this._config.getString('DEBUG'),
      this._config.getBoolean('ENEBULAR_AGENT_UPDATER_ENABLE_LOG')
    )
  }

  public getLogFilePath(): string {
    return this._log.getLogFilePath()
  }

  private _requireRootUser(user: string): void {
    this._log.info('You have to run this with root permission.')
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
    path: string,
    user: string,
    initDelay: number,
    timeout: number
  ): Promise<boolean> {
    return Utils.polling(
      async (): Promise<boolean> => {
        const info = Utils.dumpAgentInfo(path, user)
        if (!info.systemd) return true
        this._log.debug(
          `enebular-agent status: enabled:${info.systemd.enabled} active:${
            info.systemd.active
          } failed: ${info.systemd.failed}`
        )
        if (!info.systemd.active) {
          this._log.debug('enebular-agent failed to active')
        }
        if (info.systemd.failed) {
          this._log.debug('enebular-agent status is failed')
        }
        return info.systemd.failed || !info.systemd.active ? true : false
      },
      initDelay,
      1000,
      timeout
    )
  }

  private async _startAgent(
    version: string,
    path: string,
    user: string,
    serviceName: string,
    prefix = ''
  ): Promise<{}> {
    await Utils.taskAsync(
      `${prefix}Starting enebular-agent ${version}`,
      this._log,
      (): Promise<boolean> => {
        return this._system.serviceCtl(serviceName, 'start')
      }
    )

    return Utils.taskAsync(
      `${prefix}Verifying enebular-agent ${version}`,
      this._log,
      async (): Promise<boolean> => {
        if (
          await this.checkIfAgentDead(
            path,
            user,
            2000,
            this._minimumRunningTime
          )
        ) {
          throw new Error(`enebular-agent ${version} failed to start!`)
        }
        return true
      }
    )
  }

  public async update(): Promise<boolean> {
    this._log.info('enebular-agent-updater version: ' + updaterVer)

    const user = this._config.getString('ENEBULAR_AGENT_USER')
    if (process.getuid() !== 0) {
      this._requireRootUser(
        this._config.isOverridden('ENEBULAR_AGENT_USER')
          ? user
          : process.env.USER || user
      )
      return false
    }

    let agentInfo
    // Detect where existing agent is
    Utils.task(
      'Checking enebular-agent in systemd ...',
      this._log,
      (): boolean => {
        agentInfo = AgentInfo.createFromSystemd(user)
        return true
      }
    )

    if (this._config.isOverridden('ENEBULAR_AGENT_INSTALL_DIR')) {
      // We are enforced to use user specified path
      agentInfo.path = this._config.getString('ENEBULAR_AGENT_INSTALL_DIR')
    } else {
      if (agentInfo.systemd && agentInfo.systemd.path) {
        agentInfo.path = agentInfo.systemd.path
      } else {
        // TODO: scan to find agent, now we only use default path
        agentInfo.path = this._config.getString('ENEBULAR_AGENT_INSTALL_DIR')
      }
    }

    const agentPath: string = agentInfo.path
    if (agentInfo.path != agentInfo.systemd.path) {
      Utils.task(
        `Checking enebular-agent by path (${agentInfo.path})`,
        this._log,
        (): void => {
          agentInfo = AgentInfo.createFromSrc(agentPath)
        }
      )
    }

    agentInfo.prettyStatus(this._log)

    // download and build new version
    const userInfo = Utils.getUserInfo(user)
    const tarballPath = '/tmp/enebular-runtime-agent-' + Utils.randomString()
    const newAgentDirName = 'enebular-runtime-agent.new'
    const newAgentInstallPath = path.resolve(agentPath, `../${newAgentDirName}`)
    const agentInstaller = new AgentInstaller(this._config, this._log, userInfo)

    let newAgentInfo
    try {
      newAgentInfo = await agentInstaller.install(
        tarballPath,
        newAgentInstallPath
      )
    } catch (err) {
      throw new Error('Failed to install agent, reason: ' + err.message)
    }

    // TODO: check if we need to update
    this._log.info('Updating ' + Utils.echo_g(agentInfo.version) + ' to ' + Utils.echo_g(newAgentInfo.version))

    try {
      newAgentInfo = await agentInstaller.build(agentInfo, newAgentInstallPath)
    } catch (err) {
      throw new Error(`Failed to build agent:\n${err.message}`)
    }

    const serviceName = agentInfo.systemd.serviceName
    const oldAgentDirName = 'enebular-runtime-agent.old'
    const oldAgentBackupPath = path.resolve(agentPath, `../${oldAgentDirName}`)
    let switched = false

    // setup and switch to the new agent
    try {
      // shutdown current agent
      if (agentInfo.systemd.active) {
        await Utils.taskAsync(
          `Stopping enebular-agent ${agentInfo.version}`,
          this._log,
          (): Promise<boolean> => {
            return this._system.serviceCtl(serviceName, 'stop')
          }
        )
      }
      // config copying, migrate
      const migrator = new Migrator(
        agentInfo,
        newAgentInfo,
        this._config,
        this._log,
        userInfo
      )
      await migrator.migrate()

      Utils.task(
        `Switching enebular-agent from ${agentInfo.version} to ${
          newAgentInfo.version
        }`,
        this._log,
        (): Promise<boolean> => {
          if (fs.existsSync(oldAgentBackupPath)) {
            rimraf.sync(oldAgentBackupPath)
          }
          return this._system.replaceDirWithBackup(
            newAgentInstallPath,
            agentPath,
            oldAgentBackupPath
          )
        }
      )

      switched = true
      await this._startAgent(newAgentInfo.version, agentPath, user, serviceName)
    } catch (err) {
      const version = agentInfo.version
      const newVersion = newAgentInfo.version
      this._log.debug(
        `${agentInfo.systemd.serviceName} status:\n${Utils.execReturnStdout(
          `journalctl -n 100 --no-pager -ex -u ${agentInfo.systemd.serviceName}`
        )}`
      )
      this._log.info(
        `[RESTORE] Failed to start enebular-agent ${newVersion}, Flip back to ${version} ...`
      )

      // restore
      try {
        if (switched) {
          await Utils.taskAsync(
            `[RESTORE] Stopping enebular-agent ${newVersion}`,
            this._log,
            (): Promise<boolean> => {
              return this._system.serviceCtl(serviceName, 'stop')
            }
          )

          await Utils.taskAsync(
            `[RESTORE] Flipping back to enebular-agent ${version}`,
            this._log,
            (): Promise<boolean> => {
              return this._system.replaceDirWithBackup(
                oldAgentBackupPath,
                agentPath,
                newAgentInstallPath
              )
            }
          )
        }

        if (agentInfo.systemd.active) {
          await this._startAgent(
            version,
            agentPath,
            user,
            serviceName,
            '[RESTORE] '
          )
        } else {
          this._log.info(
            `[RESTORE] enebular-agent is NOT active since it was not active in systemd before updating ...`
          )
        }
      } catch (err1) {
        throw new Error(
          err.message +
            `\n[Faulty] restore to ${version} failed! error message:\n${
              err1.message
            }`
        )
      }
      throw err
    }
    
    this._log.info(Utils.echo_g('Update succeed ✔'))
    Utils.dumpAgentInfo(agentPath, user).prettyStatus(this._log)
    return true
  }
}
