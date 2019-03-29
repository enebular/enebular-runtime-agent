import fs from 'fs'
import stream from 'stream'
import path from 'path'
import rimraf from 'rimraf'
import mkdirp from 'mkdirp'
import type DockerManager from './docker-manager'

export default class Container {
  _active: boolean = false
  _dockerMan: DockerManager
  _container: Object
  _id: string
  config: Object
  state: string
  changeTs: number
  changeErrMsg: ?string
  pendingUpdateId: ?string
  pendingChange: ?string // (deploy|remove)
  pendingConfig: ?Object
  updateAttemptCount: number = 0
  lastAttemptedUpdateId: ?string

  constructor(id, dockerMan: DockerManager) {
    this._id = id
    this._dockerMan = dockerMan
    this.changeTs = Date.now()
  }

  _debug(msg: string, ...args: Array<mixed>) {
    this._dockerMan.debug(msg, ...args)
  }

  _info(msg: string, ...args: Array<mixed>) {
    this._dockerMan.info(msg, ...args)
  }

  _error(msg: string, ...args: Array<mixed>) {
    this._dockerMan.error(msg, ...args)
  }

  id(): string {
    return this._id
  }

  containerId(): string {
    return this.config.containerId
  }

  name(): string {
    return this.config.containerId.slice(0, 12)
  }

  models(): Array<Object> {
    return this.config.models
  }

  port(): Number {
    return this.config.port
  }

  mountDir(): Number {
    return this.config.mountDir
  }

  isAccepting(): boolean {
    return this.config.accept > 0
  }

  canStart(): boolean {
    return (
      this.state === 'running' ||
      this.state === 'sleep' ||
      this.state === 'error'
    )
  }

  container(): Object {
    return this._container
  }

  activate(container: Object) {
    this._active = true
    this._container = container
    this.config.containerId = container.id
  }

  deactivate() {
    this._active = false
    this._container = null
    this.config.containerId = null
  }

  isModelRunning(modelId: string): boolean {
    return this.state === 'running' && this.config.models.includes
  }

  _mountDirPath(): string {
    return path.join(this._dockerMan.mountDir(), this.config.mountDir)
  }

  serialize(): {} {
    return {
      id: this._id,
      updateId: this.updateId,
      state: this.state,
      updateAttemptCount: this.updateAttemptCount,
      lastAttemptedUpdateId: this.lastAttemptedUpdateId,
      changeTs: this.changeTs,
      changeErrMsg: this.changeErrMsg,
      config: this.config,
      pendingChange: this.pendingChange,
      pendingUpdateId: this.pendingUpdateId,
      pendingConfig: this.pendingConfig
    }
  }

  setState(state: string) {
    this.state = state
    this.changeTs = Date.now()
    if (this._active) {
      this.sync()
    }
  }

  setPendingChange(change: string, updateId: ?string, config: ?Object) {
    this._info(`Container '${this.id()}' now pending '${change}'`)

    this.pendingChange = change
    this.pendingUpdateId = updateId
    this.pendingConfig = config
    this.changeErrMsg = null
    this.changeTs = Date.now()
  }

  _removeMountDir() {
    if (!this.config.mountDir) {
      return
    }
    const mountDir = this._mountDirPath()
    if (fs.existsSync(mountDir)) {
      this._debug(
        `Removing container ${this.name()} mount directory: ${mountDir}`
      )
      rimraf.sync(mountDir)
    }
  }

  transfer(newId: string) {
    this.config.containerId = newId
  }

  addModel(config) {
    this.config.models.push(config.modelId)
    this.config.accept--
  }

  sync() {
    this._dockerMan.updateContainerReportedState(this)
  }

  async start() {
    if (!this.canStart() || !this._container) {
      return
    }
    this._info(`Starting container '${this.name()}'...`)
    try {
      await this._container.start()
      this._attachLogs()
      this.setState('running')
      return true
    } catch (err) {
      this._error('Cannot start a container ', this.name())
    }
    return false
  }

  async stop() {
    if (!this._container || this.state !== 'running') {
      return
    }
    this._info(`Stopping container '${this.name()}'...`)
    try {
      this.setState('stopping')
      await this._container.stop()
      return true
    } catch (err) {
      if (err.statusCode !== 304) {
        this._error('Cannot stop a container ', this.name())
      }
    }
    return false
  }

  async repair() {
    this._info(`Repairing container '${this.name()}'...`)
    this.setState('starting')
    const { mounts, cmd, ports, imageName } = this._config
    const config = {
      HostConfig: {
        Binds: mounts,
        Privileged: true
      },
      Image: imageName,
      Cmd: cmd,
      Tty: true
    }
    if (ports) {
      config.HostConfig.PortBindings = {}
      config.ExposedPorts = {}
      Object.keys(ports).forEach(port => {
        config.HostConfig.PortBindings[port] = [{ HostPort: ports[port] }]
        config.ExposedPorts[port] = {}
      })
    }
    try {
      const container = await this._dockerMan.createContainer(config)
      this.activate(container)
      return this.start()
    } catch (err) {
      this._info(`Could not repair container '${this.name()}'`)
      this._debug(err)
      this.setState('error')
    }
    return false
  }

  async remove(): Promise<boolean> {
    this._info(`Removing container '${this.name()}'...`)
    try {
      await this._container.remove({ force: true })
      this._container = null
      this.deactivate()
      this._removeMountDir()
      return true
    } catch (err) {
      this.error(err.message)
      return false
    }
  }

  _attachLogs() {
    const logStream = new stream.PassThrough()
    logStream.on('data', chunk => {
      this._info(`container `, chunk.toString('utf-8'))
    })
    this._container.logs(
      {
        follow: true,
        stdout: true,
        stderr: true
      },
      (err, stream) => {
        if (err) {
          return this.error(err.message)
        }
        this._container.modem.demuxStream(stream, logStream, logStream)
        stream.on('end', () => {
          if (this.state !== 'stopping') {
            this._error(`Unexpected stopping of container ${this.name()}`)
            this.setState('error')
          }
          this.sync()
          logStream.end('!stop container!')
        })
      }
    )
  }
}
