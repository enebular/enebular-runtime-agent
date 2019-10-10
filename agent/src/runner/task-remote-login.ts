import objectHash from 'object-hash'

import AgentRunnerService from './agent-runner-service'
import GetPort from 'get-port'
import Task from './task'
import TaskError from './task-error'
import { SSHConfig } from './ssh'
import { verifySignature, getPublicKey, PublicKeyInfo } from './utils'

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

export default class TaskRemoteLogin extends Task {
  public constructor(
    service: AgentRunnerService,
    settings: Record<string, any>
  ) {
    super(service, 'remoteLogin', settings)
  }

  public async run(): Promise<void> {
    const settings = this._settings as RemoteLoginSettings
    const ssh = this._service.ssh
    let publicKeyInfo
    try {
      publicKeyInfo = getPublicKey()
    } catch (err) {
      throw new TaskError(
        'ERR_INVALID_PUBLIC_KEY',
        `Invalid public key: ${err.message}`
      )
    }
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

    try {
      verifySignature(hash, pubkey, settings.signature)
    } catch (err) {
      throw new TaskError(
        'ERR_INVALID_SIGNATURE',
        `config signature verification failed: ${err.message}`,
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

      try {
        verifySignature(
          settings.localServerPublicKeyData,
          pubkey,
          config.localServerPublicKey.signature
        )
      } catch (err) {
        throw new TaskError(
          'ERR_INVALID_SIGNATURE',
          `localServerPublicKey signature verification failed: ${err.message}`,
          {
            publicKeyId: publicKeyInfo.id
          }
        )
      }

      try {
        verifySignature(
          settings.relayServerPrivateKeyData,
          pubkey,
          config.relayServerPrivateKey.signature
        )
      } catch (err) {
        throw new TaskError(
          'ERR_INVALID_SIGNATURE',
          `relayServerPrivateKey signature verification failed: ${err.message}`,
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
