import * as fs from 'fs'
import * as path from 'path'
import Utils from './utils'
import Config from './config'

export default class AgentInfo {
  public path?: string
  public version?: string
  public awsiot?: boolean
  public pelion?: boolean
  public awsiotThingCreator?: boolean
  public mbedCloudConnector?: boolean
  public mbedCloudConnectorFCC?: boolean
  public nodejsVersion?: string
  public systemd?: {
    user: string
    serviceName: string
    enabled: boolean
    active: boolean
    failed: boolean
    path?: string
  }

  public collectFromSrc(path: string): void {
    if (!fs.existsSync(path)) {
      throw new Error(`The enebular-agent directory was not found: ${path}`)
    }
    // version info
    const packageFile = path + '/agent/package.json'
    if (!fs.existsSync(packageFile)) {
      throw new Error(`Cannot found package.json, path is ${packageFile}`)
    }
    const pkg = JSON.parse(fs.readFileSync(packageFile, 'utf8'))
    ;(this.path = path),
      (this.version = pkg.version),
      (this.awsiot = fs.existsSync(`${path}/ports/awsiot/node_modules`)),
      (this.pelion =
        fs.existsSync(`${path}/ports/pelion/node_modules`) ||
        fs.existsSync(`${path}/ports/local/node_modules`)),
      (this.awsiotThingCreator = fs.existsSync(
        `${path}/tools/awsiot-thing-creator/node_modules`
      )),
      (this.mbedCloudConnector = fs.existsSync(
        `${path}/tools/mbed-cloud-connector/out/Release/enebular-agent-mbed-cloud-connector.elf`
      )),
      (this.mbedCloudConnectorFCC = fs.existsSync(
        `${path}tools/mbed-cloud-connector-fcc/__x86_x64_NativeLinux_mbedtls/Release/factory-configurator-client-enebular.elf`
      )),
      (this.nodejsVersion = Utils.getSupportedNodeJSVersion(pkg.version))
  }

  public collectFromSystemd(user: string): boolean {
    const serviceName = `enebular-agent-${user}`
    if (!fs.existsSync(`/etc/systemd/system/${serviceName}.service`)) {
      return false
    }

    this.systemd = {
      user: user,
      serviceName: serviceName,
      enabled: Utils.exec(`systemctl is-enabled --quiet ${serviceName}`),
      active: Utils.exec(`systemctl is-active --quiet ${serviceName}`),
      failed: Utils.exec(`systemctl is-failed --quiet ${serviceName}`)
    }

    let ret = Utils.execReturnStdout(
      `systemctl show --no-pager -p User --value ${serviceName}`
    )
    if (ret.stdout && this.systemd) {
      this.systemd['user'] = ret.stdout.replace(/(\n|\r)+$/, '')
    }
    ret = Utils.execReturnStdout(
      `systemctl show --no-pager -p ExecStart --value ${serviceName}`
    )
    if (ret.stdout) {
      const execStartPath = ret.stdout.split(';')[0].substring(7)
      if (execStartPath.length > 0 && this.systemd) {
        this.systemd['path'] = path.resolve(execStartPath, '../../../../')
      }
    }
    return true
  }

  public collectFromSystemdAutoFindUser(config: Config): boolean {
    const user = config.getString('ENEBULAR_AGENT_USER')
    const ret = this.collectFromSystemd(user)
    if (!ret && !config.isOverridden('ENEBULAR_AGENT_USER')) {
      // TODO: try to list enebular-agent* and check if it is under another user
      return false
    }
    return ret
  }
}
