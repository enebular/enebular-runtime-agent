import * as fs from 'fs'
import * as path from 'path'
import objectHash from 'object-hash'

import AgentRunnerService from './agent-runner-service'
import GetPort from 'get-port'
import Task from './task'
import TaskError from './task-error'
import { SSHConfig } from './ssh'
import { verifySignature } from '../utils'

interface RemoteLoginSettings {
  config: {
    enable: boolean
    localUser: string
    localServerPublicKey: {
      id: string
      size: string
      signature: string
    }
    relayServer: string
    relayServerPort: string
    relayServerUser: string
    relayServerPrivateKey: {
      id: string
      size: string
      signature: string
    }
  }
  signature: string
  localServerPublicKeyData: string
  relayServerPrivateKeyData: string
}

interface PublicKeyInfo {
  id: number
  key: string
}

export default class TaskRemoteLogin extends Task {
  public constructor(
    service: AgentRunnerService,
    settings: Record<string, any>
  ) {
    super(service, 'remoteLogin', settings)
  }

  private getPublicKey(): PublicKeyInfo {
    const publicKeyPath = path.resolve(__dirname, '../../keys/enebular')
    if (!fs.existsSync(publicKeyPath)) {
      throw new Error(`Failed to find public key directory`)
    }
    let filenames
    try {
      filenames = fs.readdirSync(publicKeyPath)
    } catch (err) {
      throw new Error(
        `Failed to get public key directory content: ${err.message}`
      )
    }

    if (filenames.length !== 1) {
      throw new Error(`Failed to locate public key`)
    }

    const id = filenames[0]
    return {
      id: id,
      key: fs.readFileSync(path.resolve(publicKeyPath, id), 'utf8')
    }
  }

  public async run(): Promise<void> {
    const settings = this._settings as RemoteLoginSettings
    const ssh = this._service.ssh
    const publicKeyInfo = this.getPublicKey()
    const pubkey = publicKeyInfo.key

    if (process.getuid() !== 0) {
      throw new TaskError(
        'ERR_PERMISSION',
        `RemoteLogin task requires root permission`
      )
    }

    if (!settings.config || !settings.signature) {
      throw new TaskError('ERR_INVALID_PARAM', `Invalid remote login settings`)
    }

    const hash = objectHash(settings.config, {
      algorithm: 'sha256',
      encoding: 'base64'
    })
    if (!verifySignature(hash, pubkey, settings.signature)) {
      throw new TaskError(
        'ERR_INVALID_SIGNATURE',
        `Invalid signature for config`,
        {
          publicKeyId: publicKeyInfo.id
        }
      )
    }

    let sshConfig: SSHConfig
    const config = settings.config
    if (!Object.prototype.hasOwnProperty.call(config, 'enable')) {
      throw new TaskError(
        'ERR_INVALID_PARAM',
        `enable is required for remote login config`
      )
    }

    if (config.enable) {
      if (
        !config.localUser ||
        !config.localServerPublicKey ||
        !config.relayServer ||
        !config.relayServerPort ||
        !config.relayServerUser ||
        !config.relayServerPrivateKey ||
        !settings.relayServerPrivateKeyData ||
        !settings.localServerPublicKeyData
      ) {
        throw new TaskError(
          'ERR_INVALID_PARAM',
          `Missing parameters for enabling remote login`
        )
      }

      if (
        !verifySignature(
          settings.localServerPublicKeyData,
          pubkey,
          config.localServerPublicKey.signature
        )
      ) {
        throw new TaskError(
          'ERR_INVALID_SIGNATURE',
          `Invalid signature for localServerPublicKey`,
          {
            publicKeyId: publicKeyInfo.id
          }
        )
      }
      if (
        !verifySignature(
          settings.relayServerPrivateKeyData,
          pubkey,
          config.relayServerPrivateKey.signature
        )
      ) {
        throw new TaskError(
          'ERR_INVALID_SIGNATURE',
          `Invalid signature for relayServerPrivateKey`,
          {
            publicKeyId: publicKeyInfo.id
          }
        )
      }

      const availablePort = await GetPort({
        port: GetPort.makeRange(10022, 11022)
      })
      const localServerPort = availablePort.toString()

      sshConfig = {
        enable: true,
        serverOptions: {
          user: config.localUser,
          port: localServerPort,
          publicKey: settings.localServerPublicKeyData
        },
        clientOptions: {
          user: config.localUser,
          localServerPort: localServerPort,
          remoteIPAddr: config.relayServer,
          remotePort: config.relayServerPort,
          remoteUser: config.relayServerUser,
          privateKey: settings.relayServerPrivateKeyData
        }
      }
    } else {
      sshConfig = {
        enable: false
      }
    }
    ssh.setConfig(sshConfig)
  }

  public async cancel(): Promise<void> {}
}
