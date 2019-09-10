import AgentInfo from '../../src/agent-info'
import { AgentInstallerIf } from '../../src/agent-installer'
import MockSystem from './system'
import { UserInfo } from '../../src/utils'

export default class MockAgentInstaller implements AgentInstallerIf {
  public failInstall: boolean = false
  public failBuild: boolean = false
  public attemptBuild: boolean = false

  private _system: MockSystem

  public constructor(system: MockSystem) {
    this._system = system
  }

  public async download(
    installPath: string,
    userInfo: UserInfo
  ): Promise<void> {
    if (this.failInstall) {
      throw new Error('Agent Install failed.')
    }
  }
  public async build(
    port: string,
    newAgentInfo: AgentInfo,
    userInfo: UserInfo,
    mbed_cloud_dev_credentials_path?: string
  ): Promise<void> {
    this.attemptBuild = true
    if (this.failBuild) {
      throw new Error('Agent Build failed.')
    }
  }

  public async bundle2PAL(
    installPath: string,
    bundlePath: string,
    userInfo: UserInfo
  ): Promise<void> {
  }

  public async installPAL(
    installPath: string,
    palPath: string,
    userInfo: UserInfo
  ): Promise<void> {
  }
}
