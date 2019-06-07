// @flow

import fs from 'fs'
import portfinder from 'portfinder'

const moduleName = 'port-man'

export default class PortManager {
  _usedPorts = [49151]

  constructor(config: Config, log: Logger) {
    this._statePortPath = config.get('ENEBULAR_PORT_STATE_PATH')
    if (!this._statePortPath) {
      throw new Error('Missing port-man configuration')
    }

    this._log = log
  }

  debug(msg: string, ...args: Array<mixed>) {
    args.push({ module: moduleName })
    this._log.debug(msg, ...args)
  }

  info(msg: string, ...args: Array<mixed>) {
    args.push({ module: moduleName })
    this._log.info(msg, ...args)
  }

  error(msg: string, ...args: Array<mixed>) {
    args.push({ module: moduleName })
    this._log.error(msg, ...args)
  }

  _lastUsedPort() {
    return Math.max(...this._usedPorts)
  }

  async setup() {
    if (this._inited) {
      return
    }

    this.debug('Docker state path: ' + this._stateDockerPath)

    await this._loadPorts()

    this._inited = true
  }

  async _loadPorts() {
    if (!fs.existsSync(this._stateDockerPath)) {
      return
    }
    this.info('Loading ports state...', this._statePortPath)
    const data = fs.readFileSync(this._stateDockerPath, 'utf8')
    const serializedPorts = JSON.parse(data)
    for (const serializedPort of serializedPorts) {
      this._usedPorts.push(serializedPort)
    }
  }

  async _savePorts() {
    this.debug('Port state: ' + JSON.stringify(this._usedPorts, null, 2))
    try {
      fs.writeFileSync(
        this._statePortPath,
        JSON.stringify(this._usedPorts),
        'utf8'
      )
    } catch (err) {
      this.error('Failed to save port state: ' + err.message)
    }
  }

  async findFreePort() {
    try {
      const port = await portfinder.getPortPromise({
        port: this._lastUsedPort() + 1
      })
      this.debug('Found free port:', port)
      this._usedPorts.push(port)
      await this._savePorts()
      return port
    } catch (err) {
      this.error(err.message)
    }
  }

  async findFreePorts(count) {
    const ports = []
    for (let i = 0; i < count; i++) {
      const newPort = await this.findFreePort()
      ports.push(newPort)
    }
    return ports
  }
}
