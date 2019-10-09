import AgentRunnerService from './agent-runner-service'
import Task from './task'
import TaskError from './task-error'
import { getPublicKey, PublicKeyInfo } from './utils'

interface RotateSettings {
  id: string
  signature: string
  key: string
}

export default class TaskRotatePublicKey extends Task {
  public constructor(
    service: AgentRunnerService,
    settings: Record<string, any>
  ) {
    super(service, 'rotatePublicKey', settings)
  }

  public async run(): Promise<void> {
    const settings = this._settings as RotateSettings
    let publicKeyInfo
    try {
      publicKeyInfo = getPublicKey()
    }
    catch (err) {
      throw new TaskError('ERR_INVALID_PUBLIC_KEY',
          `Invalid public key: ${err.message}`)
    }
    const pubkey = publicKeyInfo.key

    if (!settings.id || !settings.signature || !settings.key) {
      throw new TaskError('ERR_INVALID_PARAM', `Invalid rotate settings`)
    }

  }

  public async cancel(): Promise<void> {}
}
