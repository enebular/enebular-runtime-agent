import * as fs from 'fs'
import Utils from './utils'
import Log from './log'
import AgentVersion from './agent-version'
import { SystemIf } from './system'

export interface SystemdAgentInfo {
  path: string
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

export default class AgentInfo {
  public path: string
  public version: AgentVersion
  public nodejsVersion: string
  public installed: ComponentsInstalled
  public systemd?: SystemdAgentInfo

  public constructor(
    path: string,
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

  public static createFromSrc(
    system: SystemIf,
    path: string,
    systemd?: SystemdAgentInfo
  ): AgentInfo {
    const {
      version,
      awsiot,
      pelion,
      awsiotThingCreator,
      mbedCloudConnector,
      mbedCloudConnectorFCC
    } = system.scanAgentSource(path)

    const agentVersion = AgentVersion.parse(version)
    if (!agentVersion) {
      throw new Error(`enebular-agent version is invalid: ${version}`)
    }

    return new AgentInfo(
      path,
      agentVersion,
      awsiot,
      pelion,
      awsiotThingCreator,
      mbedCloudConnector,
      mbedCloudConnectorFCC,
      Utils.getSupportedNodeJSVersion(version),
      systemd
    )
  }

  public static createFromSystemd(system: SystemIf, user: string): AgentInfo {
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
      throw new Error(`enebular-agent path absents: ${agentPath}`)
    }

    const systemd = {
      path: agentPath,
      port: agentPort,
      user: userFromSystemd,
      serviceName: serviceName,
      enabled: system.isServiceEnabled(serviceName),
      active: system.isServiceActive(serviceName),
      failed: system.isServiceFailed(serviceName)
    }
    return AgentInfo.createFromSrc(system, agentPath, systemd)
  }

  public prettyStatus(log: Log): void {
    log.info('================================================================')
    log.info(` ${Utils.echoGreen('enebular-agent information:')}`)
    log.info('   - Version: ' + this.version)
    log.info('   - NodeJS version: ' + this.nodejsVersion)
    log.info('   - Install destination: ' + this.path)
    if (this.systemd) {
      log.info('   - Install port: ' + this.systemd.port)
      log.info('   - Install user: ' + this.systemd.user)
      log.info(` ${Utils.echoGreen('systemd information:')}`)
      log.info('   - enabled: ' + this.systemd.enabled)
      log.info('   - active: ' + this.systemd.active)
    }
    log.info('================================================================')
  }
}
