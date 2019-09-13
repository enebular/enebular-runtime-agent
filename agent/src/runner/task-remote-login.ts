import Task from './task'
import { SSHClientOptions, SSH } from './ssh'

interface RemoteLoginSettings {
  enable: boolean
  config: {
    options: {
      deviceUser: string
      serverIPaddr: string
      serverPort: string
      serverUser: string
    }
    devicePublicKey: string
    globalServerPrivateKey: string
  }
}

class TaskRemoteLogin extends Task {
  public constructor(
    settings: Object
  ) {
    super('remoteLogin', settings)
  }

  private _info(...args: any[]): void {
    console.info(...args)
  }

  public async run(): Promise<void> {
    console.log(`running task ${this._type} ...`)
    const settings = this._settings as RemoteLoginSettings
    const ssh = SSH.getInstance()

    let promises: Promise<void>[] = []
    if (settings.enable) {
      promises.push(ssh.startServer())
      promises.push(ssh.startClient(settings.config.options as SSHClientOptions))
    }
    else {
      promises.push(ssh.stopServer())
      promises.push(ssh.stopClient())
    }
    await Promise.all(promises)
  }

  public async cancel(): Promise<void> {

  }
}

function create(settings: Object) {
  return new TaskRemoteLogin(settings)
}

export { create }
