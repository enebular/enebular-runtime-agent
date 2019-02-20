import Config from './config'
import CommandLine from './command-line'
import AgentInstaller from './agent-installer'
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

export interface AgentInfo {
  path?: string
  version?: string
  enabled?: boolean
  active?: boolean
  awsiot?: boolean
  pelion?: boolean
  awsiotThingCreator?: boolean
  mbedCloudConnector?: boolean
  mbedCloudConnectorFCC?: boolean
}

export default class AgentUpdater {
  private _config: Config
  private _commandLine: CommandLine
  private _agentInstaller: AgentInstaller
  private _systemdChecked: boolean = false

  public constructor() {
    this._config = new Config()
    this._config.importConfigStrings(process.env)

    this._commandLine = new CommandLine(this._config)
    this._commandLine.parse()
    this._config.importConfigAnyTypes(this._commandLine.getConfigOptions())

    this._agentInstaller = new AgentInstaller(this._config)
  }

  private exec(cmd: string): boolean {
    const { ret } = this.execReturnStdout(cmd)
    return ret
  }

  private execReturnStdout(cmd: string): { ret: boolean; stdout?: string } {
    try {
      const stdout = execSync(cmd)
      return { ret: true, stdout: stdout.toString() }
      /* return { ret: true, stdout: "dsad"} */
    } catch (err) {
      return { ret: false }
    }
  }

  private _collectAgentInfoFromSystemd(): {
    valid: boolean
    info?: AgentInfo
  } {
    this._systemdChecked = true
    const user = this._config.getString('ENEBULAR_AGENT_USER')
    const serviceName = `enebular-agent-${user}.service`
    if (!fs.existsSync(`/etc/systemd/system/${serviceName}`)) {
      if (this._config.isOverridden('ENEBULAR_AGENT_USER'))
        return { valid: false }
      // TODO: try to list enebular-agent* and check if it is under another user
      return { valid: false }
    }

    let agentInfo: AgentInfo = {
      enabled: this.exec(`systemctl is-enabled --quiet ${serviceName}`),
      active: this.exec(`systemctl is-active --quiet ${serviceName}`)
    }
    const { stdout } = this.execReturnStdout(
      `systemctl show --no-pager -p ExecStart --value ${serviceName}`
    )
    if (stdout) {
      const execStartPath = stdout.split(';')[0].substring(7)
      if (execStartPath.length > 0) {
        agentInfo['path'] = path.resolve(execStartPath, '../../../../')
      }
    }
    return { valid: true, info: agentInfo }
  }

  private _collectAgentInfoFromSrc(path: string): AgentInfo {
    if (!fs.existsSync(path)) {
      throw new Error(`The enebular-agent directory was not found: ${path}`)
    }
    // version info
    const packageFile = path + '/agent/package.json'
    if (!fs.existsSync(packageFile)) {
      throw new Error(`Cannot found package.json, path is ${packageFile}`)
    }
    const pkg = JSON.parse(fs.readFileSync(packageFile, 'utf8'))
    let agentInfo: AgentInfo = {
      path: path,
      version: pkg.version,
      awsiot: fs.existsSync(`${path}/ports/awsiot/node_modules`),
      pelion:
        fs.existsSync(`${path}/ports/pelion/node_modules`) ||
        fs.existsSync(`${path}/ports/local/node_modules`),
      awsiotThingCreator: fs.existsSync(
        `${path}/tools/awsiot-thing-creator/node_modules`
      ),
      mbedCloudConnector: fs.existsSync(
        `${path}/tools/mbed-cloud-connector/out/Release/enebular-agent-mbed-cloud-connector.elf`
      ),
      mbedCloudConnectorFCC: fs.existsSync(
        `${path}tools/mbed-cloud-connector-fcc/__x86_x64_NativeLinux_mbedtls/Release/factory-configurator-client-enebular.elf`
      )
    }

    return agentInfo
  }

  public async update(): Promise<string> {
    let agentInfo: AgentInfo = {}
    // detect where existing agent is
    let agentInstallDir = this._config.getString('ENEBULAR_AGENT_INSTALL_DIR')
    // if user specifies install path we won't detect
    if (!this._config.isOverridden('ENEBULAR_AGENT_INSTALL_DIR')) {
      let { info } = this._collectAgentInfoFromSystemd()
      if (info) {
        agentInfo = info
        if (info.path) agentInstallDir = info.path
      }
      // TODO: scan to find agent
    }

    console.log('enebular-agent install directory is: ' + agentInstallDir)
    // check existing agent
    Object.assign(agentInfo, this._collectAgentInfoFromSrc(agentInstallDir))
    if (!this._systemdChecked) {
      let { info } = this._collectAgentInfoFromSystemd()
      if (info) {
        Object.assign(agentInfo, info)
      }
    }
    console.log(agentInfo)

    // TODO: nodejs check

    // download and build new version
    const cachePath = path.resolve(agentInstallDir, '../')
    const installPath = path.resolve(
      agentInstallDir,
      '../enebular-runtime-agent.new'
    )
    try {
      await this._agentInstaller.install(agentInfo, cachePath, installPath)
    } catch (err) {
      throw new Error('Failed to install agent:\n' + err.message)
    }

    // migrate

    // shutdown old agent

    // start new agent

    // if fail flip back to old version
    return 'sds'
  }
}
