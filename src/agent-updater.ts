import Config from './config'
import CommandLine from './command-line'
import Log from './log'
import AgentInfo from './agent-info'
import AgentInstaller from './agent-installer'
import Migrator from './migrator'
import Utils from './utils'
import { version as updaterVer } from '../package.json'
import * as path from 'path'
import * as fs from 'fs'
import * as rimraf from 'rimraf'

export default class AgentUpdater {
  private _config: Config
  private _commandLine: CommandLine
  private _log: Log

  public constructor() {
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

  private replaceFolderWithBackup(
    from: string,
    to: string,
    backup: string
  ): void {
    const cmd = `mv ${to} ${backup} && mv ${from} ${to}`
    if (!Utils.exec(cmd)) {
      throw new Error(`${cmd} failed`)
    }
  }

  private checkIfAgentDead(path: string): Promise<boolean> {
    return Utils.polling(
      async (): Promise<boolean> => {
        const info = Utils.dumpAgentInfo(
          path,
          this._config.getString('ENEBULAR_AGENT_USER')
        )
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
      2000,
      1000,
      30 * 1000 // stable to run 30 seconds
    )
  }

  private async systemdServiceCtl(
    name: string,
    action: string
  ): Promise<boolean> {
    try {
      await Utils.spawn('service', [name, action], this._log)
    } catch (err) {
      throw new Error(`Failed to ${action} ${name}:\n${err.message}`)
    }
    return true
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

    this._log.info('enebular-agent install directory is: ' + agentInfo.path)
    this._log.info('enebular-agent user is: ' + user)

    const agentPath: string = agentInfo.path
    if (agentInfo.path != agentInfo.systemd.path) {
      Utils.task(
        `Checking enebular-agent by path (${agentInfo.path}) ...`,
        this._log,
        (): boolean => {
          agentInfo = AgentInfo.createFromSrc(agentPath)
          return true
        }
      )
    }

    // download and build new version
    const userInfo = Utils.getUserInfo(user)
    const cachePath = '/tmp/enebular-runtime-agent-' + Utils.randomString()
    const newAgentDirName = 'enebular-runtime-agent.new'
    const newAgentInstallPath = path.resolve(agentPath, `../${newAgentDirName}`)
    const agentInstaller = new AgentInstaller(this._config, this._log, userInfo)

    let newAgentInfo
    try {
      newAgentInfo = await agentInstaller.install(
        agentInfo,
        cachePath,
        newAgentInstallPath
      )
    } catch (err) {
      throw new Error('Failed to install agent, reason: ' + err.message)
    }

    const serviceName = agentInfo.systemd.serviceName
    // shutdown current agent
    if (agentInfo.systemd.active) {
      await Utils.taskAsync(
        `Stopping enebular-agent ${agentInfo.version} ...`,
        this._log,
        (): Promise<boolean> => {
          return this.systemdServiceCtl(serviceName, 'stop')
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
    try {
      await migrator.migrate()
    } catch (err) {
      throw new Error('Failed to migrate agent, reason: ' + err.message)
    }

    const oldAgentDirName = 'enebular-runtime-agent.old'
    const oldAgentBackupPath = path.resolve(agentPath, `../${oldAgentDirName}`)
    Utils.task(
      `Switching enebular-agent from ${agentInfo.version} to ${
        newAgentInfo.version
      } ...`,
      this._log,
      (): boolean => {
        if (fs.existsSync(oldAgentBackupPath)) {
          rimraf.sync(oldAgentBackupPath)
        }
        this.replaceFolderWithBackup(
          newAgentInstallPath,
          agentPath,
          oldAgentBackupPath
        )
        return true
      }
    )
    await Utils.taskAsync(
      `Starting enebular-agent ${newAgentInfo.version} ...`,
      this._log,
      (): Promise<boolean> => {
        return this.systemdServiceCtl(serviceName, 'start')
      }
    )
    try {
      await Utils.taskAsync(
        `Verifying enebular-agent ${newAgentInfo.version} ...`,
        this._log,
        async (): Promise<boolean> => {
          if (await this.checkIfAgentDead(agentPath)) {
            throw new Error(`Version ${newAgentInfo.version} failed to boot!`)
          }
          return true
        }
      )
    } catch (err) {
      const toVersion = agentInfo.version
      const fromVersion = newAgentInfo.version
      this._log.info(
        `Failed to update enebular-agent ${fromVersion}, Flip back to ${toVersion} ...`
      )
      this._log.debug(`${agentInfo.systemd.serviceName} status:\n${Utils.execReturnStdout(
        `journalctl -n 100 --no-pager -ex -u ${agentInfo.systemd.serviceName}`
      )}`)

      await Utils.taskAsync(
        `Stopping enebular-agent ${fromVersion} ...`,
        this._log,
        (): Promise<boolean> => {
          return this.systemdServiceCtl(serviceName, 'stop')
        }
      )

      Utils.task(
        `Switching to enebular-agent ${toVersion} ...`,
        this._log,
        (): boolean => {
          this.replaceFolderWithBackup(
            oldAgentBackupPath,
            agentPath,
            newAgentInstallPath
          )
          return true
        }
      )

      await Utils.taskAsync(
        `Starting enebular-agent ${toVersion} ...`,
        this._log,
        (): Promise<boolean> => {
          return this.systemdServiceCtl(serviceName, 'start')
        }
      )
      await Utils.taskAsync(
        `Verifying enebular-agent ${toVersion} ...`,
        this._log,
        async (): Promise<boolean> => {
          if (await this.checkIfAgentDead(agentPath)) {
            throw new Error('[Faulty] Recovery to previous version failed!')
          }
          return true
        }
      )
      throw err
    }
    this._log.debug(
      'Enebular-agent status:\n' +
        JSON.stringify(Utils.dumpAgentInfo(agentPath, user), null, 2)
    )
    this._log.info('Update succeed.')
    return true
  }
}
