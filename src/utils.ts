import { execSync } from 'child_process'
import { AgentInfo } from './agent-updater'
import * as fs from 'fs'

export default class Utils {
  public static exec(cmd: string): boolean {
    const { ret } = Utils.execReturnStdout(cmd)
    return ret
  }

  public static execReturnStdout(
    cmd: string
  ): { ret: boolean; stdout?: string } {
    try {
      const stdout = execSync(cmd)
      return { ret: true, stdout: stdout.toString() }
      /* return { ret: true, stdout: "dsad"} */
    } catch (err) {
      return { ret: false }
    }
  }

  public static getSupportedNodeJSVersion(agentVersion: string): string {
    return 'v9.2.1'
  }

  public static collectAgentInfoFromSrc(path: string): AgentInfo {
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
      ),
      nodejsVersion: Utils.getSupportedNodeJSVersion(pkg.version)
    }
    return agentInfo
  }
}
