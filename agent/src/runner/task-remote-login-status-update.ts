import AgentRunnerService from './agent-runner-service'
import Task from './task'

export default class TaskRemoteLoginStatusUpdate extends Task {
  public constructor(service: AgentRunnerService, settings: Record<string, any>) {
    super(service, 'remoteLoginStatusUpdate', settings)
  }

  public async run(): Promise<void> {
    this._service.ssh.statusUpdate()
  }

  public async cancel(): Promise<void> {}
}
