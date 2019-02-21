import Config from './config'
import CommandLine from './command-line'
import Log from './log'
import AgentInfo from './agent-info'
import AgentInstaller from './agent-installer'
import Utils from './utils'
import * as path from 'path'
import * as fs from 'fs'
import * as rimraf from 'rimraf'

export default class AgentUpdater {
  private _config: Config
  private _commandLine: CommandLine
  private _agentInstaller: AgentInstaller
  private _log: Log

  public constructor() {
    this._config = new Config()
    this._config.importConfigStrings(process.env)

    this._commandLine = new CommandLine(this._config)
    this._commandLine.parse()
    this._config.importConfigAnyTypes(this._commandLine.getConfigOptions())

    this._log = new Log(this._config.getString('DEBUG'),
        this._config.getBoolean('ENEBULAR_AGENT_UPDATER_ENABLE_LOG'))

    this._agentInstaller = new AgentInstaller(this._config, this._log)
  }

  private _requireRootUser(user: string) {
    this._log.info('You have to run this with root permission.')
    this._log.info(
      'To update enebular-agent, copy/paste the following command:'
    )

    let appendEnvs = ''
    const overriddenItems = this._config.getOverriddenItems()
    const itemKeys = Object.keys(overriddenItems)
    itemKeys.forEach(key => {
      appendEnvs = appendEnvs + ` ${key}='${overriddenItems[key].value}'`
    })

    this._log.info(
      'sudo env PATH=$PATH:' +
        path.dirname(process.execPath) +
        appendEnvs +
        ' ' +
        process.argv[1]
    )
  }

  private replaceFolderWithBackup(from: string, to: string, backup: string) {
    const cmd = `mv ${to} ${backup} && mv ${from} ${to}`
    if (!Utils.exec(cmd)) {
      throw new Error(`${cmd} failed`)
    }
  }

  private checkIfAgentDead(path: string): Promise<boolean> {
    return Utils.polling(
      async (): Promise<boolean> => {
        const info = Utils.dumpAgentInfo(path, this._config)
        if (!info.systemd) return true
        this._log.info(
          `enebular-agent status: enabled:${info.systemd.enabled} active:${
            info.systemd.active
          } failed: ${info.systemd.failed}`
        )
        return info.systemd.failed || !info.systemd.active ? true : false
      },
      2000,
      1000,
      30 * 1000 // stable to run 30 seconds
    )
  }

  private async systemdServiceCtl(name: string, action: string) {
      try {
        await Utils.spawn(
          'service',
          [name, action],
          './',
          {},
          this._log
        )
      } catch (err) {
        throw new Error(`Failed to ${action} ${name}:\n${err.message}`)
      }
  }

  public async update(): Promise<boolean> {
    const agentInfo = new AgentInfo()
    // Detect where existing agent is
    if (!agentInfo.collectFromSystemdAutoFindUser(this._config) || !agentInfo.systemd) {
      // For now we only support enebular-agent with systemd
      throw new Error(
        'Failed to find an enebular-agent registered with systemd\n'
      )
    }

    if (process.getuid() !== 0) {
      this._requireRootUser(agentInfo.systemd.user)
      return false
    }

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
    this._log.info('enebular-agent user is: ' + agentInfo.systemd.user)
    // check existing agent
    agentInfo.collectFromSrc(agentInfo.path)

    // download and build new version
    const agentPath: string = agentInfo.path
    const cachePath = path.resolve(agentPath, '../')
    const newAgentDirName = 'enebular-runtime-agent.new'
    const newAgentInstallPath = path.resolve(agentPath, `../${newAgentDirName}`)
    try {
      await this._agentInstaller.install(
        agentInfo,
        cachePath,
        newAgentInstallPath
      )
    } catch (err) {
      throw new Error('Failed to install agent:\n' + err.message)
    }

    // shutdown current agent
    if (agentInfo.systemd.active) {
      await this.systemdServiceCtl(agentInfo.systemd.serviceName, 'stop')
    }

    // config copying

    // migrate

    this._log.info('Flip to new version')
    const oldAgentDirName = 'enebular-runtime-agent.old'
    const oldAgentBackupPath = path.resolve(agentPath, `../${oldAgentDirName}`)

    if (fs.existsSync(oldAgentBackupPath)) {
      rimraf.sync(oldAgentBackupPath)
    }
    this.replaceFolderWithBackup(newAgentInstallPath, agentPath, oldAgentBackupPath)

    // start new agent
    await this.systemdServiceCtl(agentInfo.systemd.serviceName, 'start')
    // if fail flip back to old version
    if (await this.checkIfAgentDead(agentPath)) {
      // shutdown current agent
      if (agentInfo.systemd.active) {
        await this.systemdServiceCtl(agentInfo.systemd.serviceName, 'stop')
      }

      this._log.info('Flip back to old version')
      this.replaceFolderWithBackup(
        oldAgentBackupPath,
        agentPath,
        newAgentInstallPath
      )

      // start new agent
      await this.systemdServiceCtl(agentInfo.systemd.serviceName, 'start')
      // if fail flip back to old version
      if (await this.checkIfAgentDead(agentPath)) {
        throw new Error('Upgrade failed, recover failed:')
      }
    }

    this._log.info('Update succeed.')
    this._log.debug(
      'Enebular-agent status:\n' +
        JSON.stringify(Utils.dumpAgentInfo(agentPath, this._config), null, 2)
    )
    return true
  }
}
