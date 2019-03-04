import AgentInfo from '../../src/agent-info'
import AgentVerion from '../../src/agent-version'
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
    return new AgentInfo(
      'path',
      new AgentVerion(10000, 0, 2),
      true,
      false,
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
      throw new Error('Agent Build failed.')
    }

    return new AgentInfo(
      'path',
      new AgentVerion(10000, 0, 2),
      true,
      false,
      true,
      true,
      true,
      'v9.2.1'
    )
  }
}
