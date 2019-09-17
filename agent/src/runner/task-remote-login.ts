import * as fs from 'fs'
import * as path from 'path'
import objectHash from 'object-hash'

import AgentRunnerLogger from './agent-runner-logger'
import Task from './task'
import { SSHClientOptions, SSH } from './ssh'
import { verifySignature } from '../utils'

interface RemoteLoginSettings {
  enable: boolean
  config: {
    options: {
      deviceUser: string
      serverIPaddr: string
      serverPort: string
      serverUser: string
    }
    signature: string
  }
  devicePublicKey: {
    data: string
    signature: string
  }
  globalServerPrivateKey: {
    data: string
    signature: string
  }
}

export default class TaskRemoteLogin extends Task {
  public constructor(log: AgentRunnerLogger, settings: Record<string, any>) {
    super(log, 'remoteLogin', settings)
  }

  private _info(...args: any[]): void {
    this._log.info(...args)
  }

  public async run(): Promise<void> {
    const settings = this._settings as RemoteLoginSettings
    const ssh = SSH.getInstance(this._log)
    const pubkey = fs.readFileSync(
      path.resolve(__dirname, '../../keys/enebular/pubkey.pem'),
      'utf8'
    )
    if (process.getuid() !== 0) {
      throw new Error(`RemoteLogin task requires root permission`)
    }

    const promises: Promise<void>[] = []
    if (settings.enable) {
      if (
        !settings.config ||
        !settings.devicePublicKey ||
        !settings.globalServerPrivateKey
      ) {
        throw new Error(`Invalid remote login settings`)
      }
      const hash = objectHash(settings.config.options, {
        algorithm: 'sha256',
        encoding: 'base64'
      })
      if (!verifySignature(hash, pubkey, settings.config.signature)) {
        throw new Error(`Invalid signature for options`)
      }
      if (
        !verifySignature(
          settings.devicePublicKey.data,
          pubkey,
          settings.devicePublicKey.signature
        )
      ) {
        throw new Error(`Invalid signature for devicePublicKey`)
      }
      if (
        !verifySignature(
          settings.globalServerPrivateKey.data,
          pubkey,
          settings.globalServerPrivateKey.signature
        )
      ) {
        throw new Error(`Invalid signature for globalServerPrivateKey`)
      }

      promises.push(ssh.startServer())
      promises.push(
        ssh.startClient(settings.config.options as SSHClientOptions)
      )
    } else {
      promises.push(ssh.stopServer())
      promises.push(ssh.stopClient())
    }
    await Promise.all(promises)
  }

  public async cancel(): Promise<void> {}
}
