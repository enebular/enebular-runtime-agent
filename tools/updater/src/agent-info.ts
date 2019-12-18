import * as fs from 'fs'
import Utils from './utils'
import Log from './log'
import AgentVersion from './agent-version'
import { SystemIf } from './system'

export class EnebularAgentMissingError extends Error {
  public agentPath: string
  public constructor(message: string, path: string) {
    super(message)
    this.agentPath = path
  }
}

export interface SystemdAgentInfo {
  user: string
  port: string
  serviceName: string
  enabled: boolean
  active: boolean
  failed: boolean
}

export interface ComponentsInstalled {
  awsiot: boolean
  pelion: boolean
  awsiotThingCreator: boolean
  mbedCloudConnector: boolean
  mbedCloudConnectorFCC: boolean
}

export class AgentInfo {
  public path: string
  public upath: string
  public version: AgentVersion
  public nodejsVersion: string
  public installed: ComponentsInstalled
  public systemd?: SystemdAgentInfo

  public constructor(
    path: string,
    upath: string,
    version: AgentVersion,
    awsiot: boolean,
    pelion: boolean,
    awsiotThingCreator: boolean,
    mbedCloudConnector: boolean,
    mbedCloudConnectorFCC: boolean,
    nodejsVersion: string,
    systemd?: SystemdAgentInfo
  ) {
    this.path = path
    this.upath = upath
    this.version = version
    this.installed = {
      awsiot: awsiot,
      pelion: pelion,
      awsiotThingCreator: awsiotThingCreator,
      mbedCloudConnector: mbedCloudConnector,
      mbedCloudConnectorFCC: mbedCloudConnectorFCC
    }
    this.nodejsVersion = nodejsVersion
    this.systemd = systemd
  }

  public detectPortType(): string {
    if (this.systemd) {
      return this.systemd.port
    } else {
      if (
        (this.installed.awsiot && this.installed.pelion) ||
        (!this.installed.awsiot && !this.installed.pelion)
      ) {
        throw new Error(`Failed to detect enebular-agent port type`)
      }
      return this.installed.awsiot ? 'awsiot' : 'pelion'
    }
  }

  public isServiceRegistered(): boolean {
    return this.systemd ? true : false
  }

  public isServiceActive(): boolean {
    return this.systemd && this.systemd.active ? true : false
  }

  public static createFromSource(
    system: SystemIf,
    path: string,
    upath: string,
    systemd?: SystemdAgentInfo
  ): AgentInfo {
    const {
      version,
      awsiot,
      pelion,
      awsiotThingCreator,
      mbedCloudConnector,
      mbedCloudConnectorFCC,
      nodejsVersion
    } = system.scanAgentSource(path,upath)

    const agentVersion = AgentVersion.parse(version)
    if (!agentVersion) {
      throw new Error(`enebular-agent version is invalid: ${version}`)
    }
    return new AgentInfo(
      path,
      upath,
      agentVersion,
      awsiot,
      pelion,
      awsiotThingCreator,
      mbedCloudConnector,
      mbedCloudConnectorFCC,
      nodejsVersion,
      systemd
    )
  }

  public static async createFromSystemd(
    system: SystemIf,
    user: string
  ): Promise<AgentInfo> {
    const serviceName = `enebular-agent-${user}`
    if (!system.isServiceRegistered(serviceName)) {
      throw new Error(
        `Failed to find registered enebular-agent service unit: ${serviceName}`
      )
    }

    const userFromSystemd = system.getAgentUserFromSystemd(serviceName)
    if (user != userFromSystemd) {
      throw new Error(`enebular-agent user mismatches`)
    }

    const { agentPath, agentPort } = system.getAgentPathAndPortFromSystemd(
      serviceName
    )

    if (!fs.existsSync(agentPath)) {
      throw new EnebularAgentMissingError(
        `enebular-agent path absents: ${agentPath}`,
        agentPath
      )
    }

    const systemd = {
      port: agentPort,
      user: userFromSystemd,
      serviceName: serviceName,
      enabled: system.isServiceEnabled(serviceName),
      active: system.isServiceActive(serviceName),
      failed: system.isServiceFailed(serviceName)
    }
    return AgentInfo.createFromSource(system, agentPath, '', systemd)
  }

  public prettyStatus(log: Log): void {
    log.info('================================================================')
    log.info(
      ` ${Utils.echoGreen('Existing enebular-agent install information:')}`
    )
    log.info('   - Version: ' + this.version)
    log.info('   - NodeJS version: ' + this.nodejsVersion)
    log.info('   - Install destination: ' + this.path)
    log.info('   - Install port: ' + this.detectPortType())
    if (this.systemd) {
      log.info('   - Install user: ' + this.systemd.user)
      log.info('   - Systemd config:')
      log.info('     - enabled: ' + this.systemd.enabled)
      log.info('     - active: ' + this.systemd.active)
    }
    log.info('================================================================')
  }
}

export default AgentInfo
