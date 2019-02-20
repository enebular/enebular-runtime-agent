import Config from './config'
import Utils from './utils'
import CommandLine from './command-line'
import AgentInstaller from './agent-installer'
import * as fs from 'fs'
import * as path from 'path'

export interface AgentInfo {
  path?: string
  version?: string
  awsiot?: boolean
  pelion?: boolean
  awsiotThingCreator?: boolean
  mbedCloudConnector?: boolean
  mbedCloudConnectorFCC?: boolean
  nodejsVersion?: string
  systemd?: {
    enabled?: boolean
    active?: boolean
    path?: string
  }
}

export default class AgentUpdater {
  private _config: Config
  private _commandLine: CommandLine
  private _agentInstaller: AgentInstaller

  public constructor() {
    this._config = new Config()
    this._config.importConfigStrings(process.env)

    this._commandLine = new CommandLine(this._config)
    this._commandLine.parse()
    this._config.importConfigAnyTypes(this._commandLine.getConfigOptions())

    this._agentInstaller = new AgentInstaller(this._config)
  }

  private _collectAgentInfoFromSystemd(): AgentInfo {
    const user = this._config.getString('ENEBULAR_AGENT_USER')
    const serviceName = `enebular-agent-${user}.service`
    if (!fs.existsSync(`/etc/systemd/system/${serviceName}`)) {
      if (this._config.isOverridden('ENEBULAR_AGENT_USER')) return {}
      // TODO: try to list enebular-agent* and check if it is under another user
      return {}
    }

    let agentInfo: AgentInfo = {
      systemd: {
        enabled: Utils.exec(`systemctl is-enabled --quiet ${serviceName}`),
        active: Utils.exec(`systemctl is-active --quiet ${serviceName}`)
      }
    }

    let ret = Utils.execReturnStdout(
      `systemctl show --no-pager -p User --value ${serviceName}`
    )
    if (ret.stdout && agentInfo.systemd) {
      agentInfo.systemd['user'] = ret.stdout.replace(/(\n|\r)+$/, '')
    }
    ret = Utils.execReturnStdout(
      `systemctl show --no-pager -p ExecStart --value ${serviceName}`
    )
    if (ret.stdout) {
      const execStartPath = ret.stdout.split(';')[0].substring(7)
      if (execStartPath.length > 0 && agentInfo.systemd) {
        agentInfo.systemd['path'] = path.resolve(execStartPath, '../../../../')
      }
    }
    return agentInfo
  }

  public async update(): Promise<string> {
    // detect where existing agent is based on systemd
    let agentInfo = this._collectAgentInfoFromSystemd()

    if (this._config.isOverridden('ENEBULAR_AGENT_INSTALL_DIR')) {
      // we are enforced to use user specified path
      agentInfo.path = this._config.getString('ENEBULAR_AGENT_INSTALL_DIR')
    } else {
      if (agentInfo.systemd && agentInfo.systemd.path) {
        agentInfo.path = agentInfo.systemd.path
      } else {
        // TODO: scan to find agent, now we only use default path
        agentInfo.path = this._config.getString('ENEBULAR_AGENT_INSTALL_DIR')
      }
    }

    console.log('enebular-agent install directory is: ' + agentInfo.path)
    // check existing agent
    Object.assign(agentInfo, Utils.collectAgentInfoFromSrc(agentInfo.path))

    // download and build new version
    const cachePath = path.resolve(agentInfo.path, '../')
    const installPath = path.resolve(
      agentInfo.path,
      '../enebular-runtime-agent.new'
    )
    try {
      await this._agentInstaller.install(agentInfo, cachePath, installPath)
    } catch (err) {
      throw new Error('Failed to install agent:\n' + err.message)
    }

    // migrate

    // shutdown old agent

    // config copying

    // start new agent

    // if fail flip back to old version
    return 'sds'
  }
}
