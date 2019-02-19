import Config from './config'
import CommandLine from './command-line'
import util from 'util'
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

interface AgentInfo {
  path?: string
  version?: string
  enabled?: boolean
  active?: boolean
}

const exec = util.promisify(require('child_process').exec)

export default class AgentUpdater {
  private _config: Config
  private _commandLine: CommandLine
  private _systemdChecked: boolean = false

  public constructor() {
    this._config = new Config()
    this._config.importConfigStrings(process.env)

    this._commandLine = new CommandLine(this._config)
    this._commandLine.parse()
    this._config.importConfigAnyTypes(this._commandLine.getConfigOptions())
  }

  private exec(cmd: string): boolean {
    const { ret } = this.execWithStdout(cmd)
    return ret
  }

  private execWithStdout(cmd: string): { ret: boolean; stdout?: string } {
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
    const { stdout } = this.execWithStdout(
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
      version: pkg.version
    }

    // ownership
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
      }
      // TODO: scan to find agent
    }

    if (!agentInstallDir) {
      throw new Error(`Cannot found enebular-agent install path`)
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

    // disk space check, nodejs check, etc

    // download

    // build new version

    // migrate

    // shutdown old agent

    // start new agent

    // if fail flip back to old version
    return 'sds'
  }
}
