import * as path from 'path'
import * as fs from 'fs'

import AgentVersion from './agent-version'
import Utils from './utils'
import Log from './log'

export interface SystemIf {
  getServiceLogIgnoreError(serviceName: string, lines: number): string

  stopAgent(service: string): Promise<boolean>
  stopNewAgent(service: string): Promise<boolean>
  startAgent(service: string): Promise<boolean>
  startNewAgent(service: string): Promise<boolean>
  flipToNewAgent(
    newAgent: string,
    agent: string,
    agentBackup: string
  ): Promise<boolean>
  flipToOriginalAgent(
    originalAgent: string,
    newAgent: string,
    newAgentBackup: string
  ): Promise<boolean>
  isAgentDead(serviceName: string): boolean
  isNewAgentDead(serviceName: string): boolean
  isServiceRegistered(serviceName: string): boolean
  isServiceEnabled(serviceName: string): boolean
  isServiceActive(serviceName: string): boolean
  isServiceFailed(serviceName: string): boolean
  getAgentPathAndPortFromSystemd(
    serviceName: string
  ): { agentPath: string; agentPort: string }
  getAgentUserFromSystemd(serviceName: string): string
  scanAgentSource(
    path: string
  ): {
    version: string
    awsiot: boolean
    pelion: boolean
    awsiotThingCreator: boolean
    mbedCloudConnector: boolean
    mbedCloudConnectorFCC: boolean
  }
  getSupportedNodeJSVersion(agentVersion: AgentVersion): string
}

export class System implements SystemIf {
  private _log: Log

  public constructor(log: Log) {
    this._log = log
  }

  public getServiceLogIgnoreError(serviceName: string, lines: number): string {
    const ret = Utils.execReturnStdout(
      `journalctl -n ${lines} --no-pager -ex -u ${serviceName}`
    )
    return ret ? ret : ''
  }

  public async stopAgent(service: string): Promise<boolean> {
    return this._serviceCtl(service, 'stop')
  }

  public async stopNewAgent(service: string): Promise<boolean> {
    return this._serviceCtl(service, 'stop')
  }

  public async startAgent(service: string): Promise<boolean> {
    return this._serviceCtl(service, 'start')
  }

  public async startNewAgent(service: string): Promise<boolean> {
    return this._serviceCtl(service, 'start')
  }

  private async _serviceCtl(name: string, action: string): Promise<boolean> {
    try {
      await Utils.spawn('service', [name, action], this._log)
    } catch (err) {
      throw new Error(`Failed to ${action} ${name}:\n${err.message}`)
    }
    return true
  }

  public isAgentDead(serviceName: string): boolean {
    return this._isAgentDead(serviceName)
  }

  public isNewAgentDead(serviceName: string): boolean {
    return this._isAgentDead(serviceName)
  }

  private _isAgentDead(serviceName: string): boolean {
    const active = this.isServiceActive(serviceName)
    const failed = this.isServiceFailed(serviceName)
    this._log.debug(`enebular-agent status: active:${active} failed: ${failed}`)
    if (!active) {
      this._log.debug('enebular-agent failed to active')
    }
    if (failed) {
      this._log.debug('enebular-agent status is failed')
    }
    // TODO: should we check other things like if it connected to port or not.
    return failed || !active ? true : false
  }

  public isServiceRegistered(serviceName: string): boolean {
    const serviceFile = `${serviceName}.service`
    const ret = Utils.execReturnStdout(
      `systemctl list-unit-files ${serviceFile} | grep ${serviceFile} | wc -l`
    )
    return ret && ret.replace(/(\n|\r)+$/, '') == '1' ? true : false
  }

  public isServiceEnabled(serviceName: string): boolean {
    return Utils.exec(`systemctl is-enabled --quiet ${serviceName}`)
  }

  public isServiceActive(serviceName: string): boolean {
    return Utils.exec(`systemctl is-active --quiet ${serviceName}`)
  }

  public isServiceFailed(serviceName: string): boolean {
    return Utils.exec(`systemctl is-failed --quiet ${serviceName}`)
  }

  public getAgentUserFromSystemd(serviceName: string): string {
    let user
    const ret = Utils.execReturnStdout(
      `systemctl show --no-pager -p User ${serviceName}`
    )
    if (ret) {
      const userProp = ret.slice(ret.indexOf('=') + 1)
      user = userProp.replace(/(\n|\r)+$/, '')
    }
    if (!user) {
      throw new Error('Failed to find agent user in systemd')
    }
    return user
  }

  public getAgentPathAndPortFromSystemd(
    serviceName: string
  ): { agentPath: string; agentPort: string } {
    let agentPath, agentPort
    const ret = Utils.execReturnStdout(
      `systemctl show --no-pager -p ExecStart ${serviceName}`
    )
    if (ret) {
      const execStartProp = ret.slice(ret.indexOf('=') + 1)
      const execStartPath = execStartProp.split(';')[0].substring(7)
      if (execStartPath.length > 0) {
        agentPath = path.resolve(execStartPath, '../../../../')
        agentPort = path.parse(path.resolve(execStartPath, '../../')).name
        agentPort = agentPort == 'local' ? 'pelion' : agentPort
      }
    }
    if (!agentPath) {
      throw new Error('Failed to find agent path in systemd')
    }
    return { agentPath: agentPath, agentPort: agentPort }
  }

  public scanAgentSource(
    path: string
  ): {
    version: string
    awsiot: boolean
    pelion: boolean
    awsiotThingCreator: boolean
    mbedCloudConnector: boolean
    mbedCloudConnectorFCC: boolean
  } {
    if (!fs.existsSync(path)) {
      throw new Error(`The enebular-agent directory was not found: ${path}`)
    }
    // version info
    const packageFile = path + '/agent/package.json'
    if (!fs.existsSync(packageFile)) {
      throw new Error(`Cannot found package.json, path is ${packageFile}`)
    }
    const pkg = JSON.parse(fs.readFileSync(packageFile, 'utf8'))
    return {
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
  }

  public async flipToNewAgent(
    newAgent: string,
    agent: string,
    agentBackup: string
  ): Promise<boolean> {
    return this._replaceDirWithBackup(newAgent, agent, agentBackup)
  }

  public async flipToOriginalAgent(
    originalAgent: string,
    newAgent: string,
    newAgentBackup: string
  ): Promise<boolean> {
    return this._replaceDirWithBackup(originalAgent, newAgent, newAgentBackup)
  }

  private async _replaceDirWithBackup(
    from: string,
    to: string,
    backup: string
  ): Promise<boolean> {
    try {
      await Utils.spawn('mv', [to, backup], this._log)
    } catch (err) {
      throw new Error(`Failed to move ${to} to ${backup}:\n${err.message}`)
    }

    try {
      await Utils.spawn('mv', [from, to], this._log)
    } catch (err) {
      throw new Error(`Failed to move ${from} to ${to}:\n${err.message}`)
    }
    return true
  }

  public getSupportedNodeJSVersion(agentVersion: AgentVersion): string {
    switch (agentVersion.toString()) {
      default:
        return 'v9.2.1'
    }
  }
}

export default System
