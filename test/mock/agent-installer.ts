import AgentInfo from '../../src/agent-info'
import AgentVersion from '../../src/agent-version'
import { AgentInstallerIf } from '../../src/agent-installer'
import { SystemIf } from '../../src/system'
import { UserInfo } from '../../src/utils'

export default class MockAgentInstaller implements AgentInstallerIf {
  public failInstall: boolean = false
  public failBuild: boolean = false

  private _system: SystemIf

  public constructor(system: SystemIf) {
    this._system = system
  }

  private fakeAgentInfo(): AgentInfo {
    const path = 'fake-new-agent'
    const {
      version,
      awsiot,
      pelion,
      awsiotThingCreator,
      mbedCloudConnector,
      mbedCloudConnectorFCC
    } = this._system.scanAgentSource(path)

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
      this._system.getSupportedNodeJSVersion(agentVersion)
    )
  }

  public async install(
    installPath: string,
    userInfo: UserInfo
  ): Promise<AgentInfo> {
    if (this.failInstall) {
      throw new Error('Agent Install failed.')
    }
    return this.fakeAgentInfo()
  }
  public async build(
    agentInfo: AgentInfo,
    newAgentInfo: AgentInfo,
    userInfo: UserInfo
  ): Promise<void> {
    if (this.failBuild) {
      throw new Error('Agent Build failed.')
    }
  }
}
