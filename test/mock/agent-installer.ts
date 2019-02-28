import AgentInfo from '../../src/agent-info'
import { AgentInstallerIf } from '../../src/agent-installer'
import { UserInfo } from '../../src/utils'

export default class MockAgentInstaller implements AgentInstallerIf {
  public failInstall: boolean = false
  public failBuild: boolean = false

  public async install(
    cachePath: string,
    installPath: string,
    userInfo: UserInfo
  ): Promise<AgentInfo> {
    if (this.failInstall) {
      throw new Error('Agent Install failed.')
    }
    /*
    path: string,
    version: string,
    awsiot: boolean,
    pelion: boolean,
    port: string,
    awsiotThingCreator: boolean,
    mbedCloudConnector: boolean,
    mbedCloudConnectorFCC: boolean,
    nodejsVersion: string

       */
    return new AgentInfo(
      'path',
      '0.0.2',
      true,
      false,
      'pelion',
      true,
      true,
      true,
      'v9.2.1'
    )
  }
  public async build(
    agentInfo: AgentInfo,
    installPath: string,
    userInfo: UserInfo
  ): Promise<AgentInfo> {
    if (this.failBuild) {
      throw new Error('Agent Install failed.')
    }

    return new AgentInfo(
      'path',
      '0.0.2',
      true,
      false,
      'pelion',
      true,
      true,
      true,
      'v9.2.1'
    )
  }
}
