import * as fs from 'fs'
import * as path from 'path'
import AgentRunnerService from './agent-runner-service'
import Task from './task'
import TaskError from './task-error'
import { verifySignature, getPublicKey, PublicKeyInfo } from './utils'

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

    try {
      verifySignature(
        settings.key,
        pubkey,
        settings.signature
      )
    }
    catch (err) {
      throw new TaskError(
        'ERR_INVALID_SIGNATURE',
        `Invalid signature for public key: ${err.message}`,
        {
          publicKeyId: publicKeyInfo.id
        }
      )
    }

    const oldPublicKeyFilename = path.resolve(publicKeyInfo.path, publicKeyInfo.id)
    const newPublicKeyFilename = path.resolve(publicKeyInfo.path, settings.id)
    try {
      fs.writeFileSync(newPublicKeyFilename, settings.key, 'utf8')
      fs.chmodSync(newPublicKeyFilename, 0o600)
    }
    catch (err) {
      throw new TaskError('ERR_SAVE_FILE',
          `Cannot save public key: ${err.message}`)
    }

    try {
      fs.unlinkSync(oldPublicKeyFilename)
    }
    catch (err) {
      throw new TaskError('ERR_DELETE_FILE',
          `Cannot remove current public key: ${err.message}`)
    }
  }

  public async cancel(): Promise<void> {}
}
