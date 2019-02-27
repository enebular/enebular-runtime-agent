import * as fs from 'fs'
import * as path from 'path'
import Utils from './utils'
import Log from './log'

export default class AgentInfo {
  public path: string
  public version: string
  public awsiot: boolean
  public pelion: boolean
  public port: string
  public awsiotThingCreator: boolean
  public mbedCloudConnector: boolean
  public mbedCloudConnectorFCC: boolean
  public nodejsVersion: string
  public systemd?: {
    user: string
    serviceName: string
    enabled: boolean
    active: boolean
    failed: boolean
    path?: string
  }

  private constructor(
    path: string,
    version: string,
    awsiot: boolean,
    pelion: boolean,
    port: string,
    awsiotThingCreator: boolean,
    mbedCloudConnector: boolean,
    mbedCloudConnectorFCC: boolean,
    nodejsVersion: string
  ) {
    this.path = path
    this.version = version
    this.awsiot = awsiot
    this.pelion = pelion
    this.port = port
    this.awsiotThingCreator = awsiotThingCreator
    this.mbedCloudConnector = mbedCloudConnector
    this.mbedCloudConnectorFCC = mbedCloudConnectorFCC
    this.nodejsVersion = nodejsVersion
  }

  public static createFromSrc(path: string): AgentInfo {
    if (!fs.existsSync(path)) {
      throw new Error(`The enebular-agent directory was not found: ${path}`)
    }
    // version info
    const packageFile = path + '/agent/package.json'
    if (!fs.existsSync(packageFile)) {
      throw new Error(`Cannot found package.json, path is ${packageFile}`)
    }
    const pkg = JSON.parse(fs.readFileSync(packageFile, 'utf8'))
    const awsiot = fs.existsSync(`${path}/ports/awsiot/node_modules`)
    const pelion = fs.existsSync(`${path}/ports/pelion/node_modules`) ||
        fs.existsSync(`${path}/ports/local/node_modules`)
    const port = (!awsiot && !pelion) ? "unknown" : (pelion ? "pelion" : "awsiot")
    const awsiotThingCreator = fs.existsSync(`${path}/tools/awsiot-thing-creator/node_modules`)
    const mbedCloudConnector = fs.existsSync(
      `${path}/tools/mbed-cloud-connector/out/Release/enebular-agent-mbed-cloud-connector.elf`
    )
    const mbedCloudConnectorFCC = fs.existsSync(
      `${path}tools/mbed-cloud-connector-fcc/__x86_x64_NativeLinux_mbedtls/Release/factory-configurator-client-enebular.elf`
    )
    return new AgentInfo(
      path,
      pkg.version,
      awsiot,
      pelion,
      port,
      awsiotThingCreator,
      mbedCloudConnector,
      mbedCloudConnectorFCC,
      Utils.getSupportedNodeJSVersion(pkg.version)
    )
  }

  public static createFromSystemd(user: string): AgentInfo {
    const serviceName = `enebular-agent-${user}`
    const serviceConfigPath = `/etc/systemd/system/${serviceName}.service`
    if (!fs.existsSync(serviceConfigPath)) {
      throw new Error(
        `Failed to find registered service unit: ${serviceConfigPath}`
      )
    }

    const systemd = {
      user: user,
      serviceName: serviceName,
      enabled: Utils.exec(`systemctl is-enabled --quiet ${serviceName}`),
      active: Utils.exec(`systemctl is-active --quiet ${serviceName}`),
      failed: Utils.exec(`systemctl is-failed --quiet ${serviceName}`)
    }

    let ret = Utils.execReturnStdout(
      `systemctl show --no-pager -p User ${serviceName}`
    )
    if (ret) {
      const userProp = ret.slice(ret.indexOf('=') + 1)
      systemd['user'] = userProp.replace(/(\n|\r)+$/, '')
    }
    ret = Utils.execReturnStdout(
      `systemctl show --no-pager -p ExecStart ${serviceName}`
    )
    if (ret) {
      const execStartProp = ret.slice(ret.indexOf('=') + 1)
      const execStartPath = execStartProp.split(';')[0].substring(7)
      if (execStartPath.length > 0) {
        systemd['path'] = path.resolve(execStartPath, '../../../../')
      }
    }

    if (!systemd['path'] || !fs.existsSync(systemd['path'])) {
      throw new Error(`Failed to find enebular-agent, path: ${systemd['path']}`)
    }
    const agentInfo = AgentInfo.createFromSrc(systemd['path'])
    agentInfo.systemd = systemd
    return agentInfo
  }

  prettyStatus(log: Log): void {
    log.info('================================================================')
    log.info(` ${Utils.echo_g('enebular-agent information:')}`)
    log.info('   - Version: ' + this.version)
    log.info('   - NodeJS version: ' + this.nodejsVersion)
    log.info('   - Install destination: ' + this.path)
    log.info('   - Install port: ' + this.port)
    if (this.systemd) {
      log.info('   - Install user: ' + this.systemd.user)
      log.info(` ${Utils.echo_g('systemd information:')}`)
      log.info('   - enabled: ' + this.systemd.enabled)
      log.info('   - active: ' + this.systemd.active)
    }
    log.info('================================================================')
  }
}
