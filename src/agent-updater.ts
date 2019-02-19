import Config from './config'
import CommandLine from './command-line'
import util from 'util'
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import checkDiskSpace from 'check-disk-space'
import request from 'request'
import progress from 'request-progress'

interface AgentInfo {
  path?: string
  version?: string
  enabled?: boolean
  active?: boolean
}

export default class AgentUpdater {
  private _config: Config
  private _commandLine: CommandLine
  private _systemdChecked: boolean = false
  private _minimumRequiredDiskSpace: number = 400 * 1024 * 1024 // 400 MiB

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

  private async _fetchAgent(url: string, path: string): Promise<string> {
    let usageInfo
    try {
      usageInfo = await checkDiskSpace(path)
    } catch (err) {
      throw new Error('Failed to get free space: ' + err.message)
    }
    if (usageInfo.free < this._minimumRequiredDiskSpace) {
      throw new Error(
        `Not enough storage space (available: ${usageInfo.free}B, required: ${
          this._minimumRequiredDiskSpace
        }B)`
      )
    }

    const onProgress = (state): void => {
      console.log(
        util.format(
          'Download progress: %f%% @ %fKB/s, %fsec',
          state.percent ? Math.round(state.percent * 100) : 0,
          state.speed ? Math.round(state.speed / 1024) : 0,
          state.time.elapsed ? Math.round(state.time.elapsed) : 0
        )
      )
    }
    console.log(`Downloading ${url} to ${path} ...`)
    return new Promise((resolve, reject) => {
      const fileStream = fs.createWriteStream(path)
      fileStream.on('error', err => {
        reject(err)
      })
      progress(request(url), {
        delay: 5000,
        throttle: 5000
      })
        .on('response', response => {
          console.log(
            `Response: ${response.statusCode}: ${response.statusMessage}`
          )
          if (response.statusCode >= 400) {
            reject(
              new Error(
                `Error response: ${response.statusCode}: ${
                  response.statusMessage
                }`
              )
            )
          }
        })
        .on('progress', onProgress)
        .on('error', err => {
          reject(err)
        })
        .on('end', () => {
          resolve()
        })
        .pipe(fileStream)
    })
  }

  /* private async _installAgent(tarball: string, dst: string): Promise<string> { */

  /* } */

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
    /* console.log(agentInfo) */

    // TODO: nodejs check

    // download
    try {
      await this._fetchAgent(
        this._config.getString('ENEBULAR_AGENT_DOWNLOAD_URL'),
        path.resolve(agentInstallDir, '../enebular-agent-latest.tar.gz')
      )
    }
    catch(err) {
      throw new Error('Failed to download agent: ' + err.message)
    }

    /* await this._init */

    // build new version

    // migrate

    // shutdown old agent

    // start new agent

    // if fail flip back to old version
    return 'sds'
  }
}
