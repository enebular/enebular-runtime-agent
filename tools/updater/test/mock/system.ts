import * as fs from 'fs'
import * as os from 'os'

import { SystemIf } from '../../src/system'
import AgentVersion from '../../src/agent-version'
import Utils from '../../src/utils'

export default class MockSystem implements SystemIf {
  public failStartAgent = false
  public failStartNewAgent = false
  public failStopAgent = false
  public failStopNewAgent = false
  public failFlipNewAgent = false
  public failFlipOriginalAgent = false

  public attemptStartAgent = 0
  public attemptStartNewAgent = 0
  public attemptStopAgent = 0
  public attemptStopNewAgent = 0
  public attemptFlipNewAgent = 0
  public attemptFlipOriginalAgent = 0
  public attemptVerifyAgent = 0
  public attemptVerifyNewAgent = 0

  public agentIsDead = false
  public newAgentIsDeadThrows = false
  public newAgentIsDead = false

  public serviceIsRegistered = true
  public serviceIsEnabled = true
  public serviceIsActive = true
  public serviceIsFailed = false

  public throwsWhenScanOriginalAgent = false
  public throwsWhenScanNewAgent = false

  public path = '/tmp/enebular-agent-test-' + Utils.randomString()
  public newPath = '/tmp/enebular-new-agent-test-' + Utils.randomString()
  public port = 'awsiot'
  public user = os.userInfo().username
  public agent = {
    version: '2.3.0',
    nodejsVersion: 'v9.2.1'
  }
  public newAgent = {
    version: '2.4.0',
    nodejsVersion: 'v9.2.1'
  }

  public constructor() {
    if (!fs.existsSync(this.path)) {
      fs.mkdirSync(this.path)
    }
  }

  public getSupportedNodeJSVersion(agentVersion: AgentVersion): string {
    return agentVersion.toString() == this.agent.version
      ? this.agent.nodejsVersion
      : this.newAgent.nodejsVersion
  }

  public getServiceLogIgnoreError(serviceName: string, lines: number): string {
    return ''
  }

  public async stopAgent(service: string, newAgent: boolean): Promise<boolean> {
    if (newAgent) {
      this.attemptStopNewAgent++
      if (this.failStopNewAgent) {
        throw new Error(`stop new agent failed`)
      }
    }
    else {
      this.attemptStopAgent++
      if (this.failStopAgent) {
        throw new Error(`stop agent failed`)
      }
    }
    return true
  }

  public async startAgent(service: string, newAgent: boolean): Promise<boolean> {
    if (newAgent) {
      this.attemptStartNewAgent++
      if (this.failStartNewAgent) {
        throw new Error(`start new agent failed`)
      }
    }
    else {
      this.attemptStartAgent++
      if (this.failStartAgent) {
        throw new Error(`start agent failed`)
      }
    }
    return true
  }

  public async flipToNewAgent(
    newAgent: string,
    agent: string,
    agentBackup: string
  ): Promise<boolean> {
    this.attemptFlipNewAgent++
    if (this.failFlipNewAgent) {
      throw new Error(`flip new agent failed`)
    }
    return true
  }

  public async flipToOriginalAgent(
    originalAgent: string,
    newAgent: string,
    newAgentBackup: string
  ): Promise<boolean> {
    this.attemptFlipOriginalAgent++
    if (this.failFlipOriginalAgent) {
      throw new Error(`flip original agent failed`)
    }
    return true
  }

  public isAgentDead(serviceName: string, newAgent: boolean): boolean {
    if (newAgent) {
      this.attemptVerifyNewAgent++
      if (this.newAgentIsDeadThrows) {
        throw new Error(`expection: new agent is dead`)
      }
      return this.newAgentIsDead
    }
    else {
      this.attemptVerifyAgent++
      return this.agentIsDead
    }
  }

  public isServiceRegistered(serviceName: string): boolean {
    return this.serviceIsRegistered
  }

  public isServiceEnabled(serviceName: string): boolean {
    return this.serviceIsEnabled
  }

  public isServiceActive(serviceName: string): boolean {
    return this.serviceIsActive
  }

  public isServiceFailed(serviceName: string): boolean {
    return this.serviceIsFailed
  }

  public getAgentPathAndPortFromSystemd(
    serviceName: string
  ): { agentPath: string; agentPort: string } {
    return {
      agentPath: this.path,
      agentPort: this.port
    }
  }

  public getAgentUserFromSystemd(serviceName: string): string {
    return this.user
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
    let agentVersion
    if (path == this.newPath || path.indexOf('.new') > -1) {
      if (this.throwsWhenScanNewAgent)
        throw new Error('Scan new agent source return error')
      agentVersion = this.newAgent.version
    } else {
      if (this.throwsWhenScanOriginalAgent)
        throw new Error('Scan agent source return error')
      agentVersion = this.agent.version
    }
    return {
      version: agentVersion,
      awsiot: this.port == 'awsiot',
      pelion: this.port == 'pelion',
      awsiotThingCreator: this.port == 'awsiot',
      mbedCloudConnector: this.port == 'pelion',
      mbedCloudConnectorFCC: this.port == 'pelion'
    }
  }

  public async installDebianPackages(packages: string[]): Promise<void> {}

  public async updateNodeJSVersionInSystemd(
    user: string,
    version: string,
    newVersion: string,
    file?: string
  ): Promise<void> {}
}
