import Log from '../../src/log'
import { SystemIf } from '../../src/system'

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

  public getServiceLogIgnoreError(serviceName: string, lines: number): string {
    return ''
  }

  public async stopAgent(service: string): Promise<boolean> {
    this.attemptStopAgent++
    if (this.failStopAgent) {
      throw new Error(`stop agent failed`)
    }
    return true
  }

  public async stopNewAgent(service: string): Promise<boolean> {
    this.attemptStopNewAgent++
    if (this.failStopNewAgent) {
      throw new Error(`stop new agent failed`)
    }
    return true
  }

  public async startAgent(service: string): Promise<boolean> {
    this.attemptStartAgent++
    if (this.failStartAgent) {
      throw new Error(`start agent failed`)
    }
    return true
  }

  public async startNewAgent(service: string): Promise<boolean> {
    this.attemptStartNewAgent++
    if (this.failStartNewAgent) {
      throw new Error(`start new agent failed`)
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

  public isAgentDead(path: string, user: string) {
    this.attemptVerifyAgent++
    return this.agentIsDead
  }

  public isNewAgentDead(path: string, user: string) {
    this.attemptVerifyNewAgent++
    if (this.newAgentIsDeadThrows) {
      throw new Error(`expection: new agent is dead`)
    }
    return this.newAgentIsDead
  }
}
