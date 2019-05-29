import fs from 'fs'
import stream from 'stream'
import path from 'path'
import rimraf from 'rimraf'
import type DockerManager from './docker-manager'
import Exec from './exec'
import { delay } from './utils'

export default class Container {
  _active: boolean = false
  _dockerMan: DockerManager
  _container: Object
  _exec: Object
  _id: string
  _execs: Array<Exec> = []
  _restartCount: number = 0
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
    return this.config.name
  }

  models(): Array<Object> {
    return this.config.models
  }

  handlers(): Array<Object> {
    return this.config.handlers || []
  }

  freePort(): Number {
    return this.config.ports[this.config.models.length]
  }

  mountDir(): Number {
    return this.config.mountDir
  }

  isAccepting(): boolean {
    return this.config.accept > 0
  }

  imageName(): string {
    return this.config.imageName
  }

  _updateEndpoint() {
    const endpoint = `${this._dockerMan.ipAddress()}:${this.port()}`
    if (this.endpoint() !== endpoint) {
      this.config.endpoint = endpoint
      this.sync()
    }
  }

  endpoint() {
    return this.config.endpoint
  }

  isActive(): boolean {
    return this._active
  }

  isOpen(): Boolean {
    return this.config.cacheSize > 1
  }

  port(): string {
    return this.config.port
  }

  createOptions(): Object {
    return this.config.createOptions
  }

  canStart(): Boolean {
    return !this.state || this.state !== 'stopped'
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

  mountDirPath(): string {
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
    if (state !== this.state) {
      this.state = state
      if (this._active) {
        this.sync()
      }
    }
  }

  setPendingChange(change: string, updateId: ?string) {
    this._info(`Container '${this.name()}' now pending '${change}'`)

    this.pendingChange = change
    this.pendingUpdateId = updateId
    this.changeErrMsg = null
    this.changeTs = Date.now()
  }

  _removeMountDir() {
    if (!this.config.mountDir) {
      return
    }
    const mountDir = this.mountDirPath()
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

  sync() {
    this.changeTs = Date.now()
    this._dockerMan.sync('container', this)
  }

  async _inspect() {
    return new Promise((resolve, reject) => {
      this._container.inspect((err, data) => {
        if (err) {
          reject(err)
        }
        resolve(data)
      })
    })
  }

  async _showEndpoints() {
    let message = `Model's ${this.name()} endpoint(s):\n`
    this.handlers().forEach(handler => {
      message += `'${handler.nodeTitle}' at ${this.endpoint()}/${handler.id}\n`
    })
    this._info(message)
  }

  async _startExec() {
    return new Promise((resolve, reject) => {
      this._exec.start((err, stream) => {
        if (err) {
          reject(err)
        }
        resolve(stream)
      })
    })
  }

  async _execModel() {
    this._info(`Executing model '${this.name()}'...`)
    try {
      const { command } = this.createOptions()
      const options = {
        Cmd: command,
        AttachStdout: true,
        AttachStderr: true,
        Privileged: true
      }
      this._exec = await this._container.exec(options)
      const logStream = await this._startExec()
      this._attachLogsToExec(logStream)
      this.setState('running')
      return true
    } catch (err) {
      this._error(err.message)
    }
    return false
  }

  async _restart() {
    if (!this._active) {
      return
    }
    if (this._restartCount < 2) {
      this._restartCount++
      this._info(`Restart #${this.restartCount} of model '${this.name()}'...`)
      await this.repair()
      await this.start(true)
    } else {
      this._info(
        `Exceeded maximum number of restarts of model '${this.name()}'...`
      )
      await this._crash()
    }
  }

  async start(noRestart) {
    this._info('WE ARE STARTING', this.state)
    if (!this._container) {
      this._info(
        `No actual docker container attached to model '${this.name()}'...`
      )
      const repaired = await this.repair()
      if (!repaired) {
        return false
      }
    }
    this._info(`Starting container '${this.name()}'...`)
    try {
      this._updateEndpoint()
      await this._container.start()
    } catch (err) {
      if (err.statusCode === 304) {
        this._info(
          `Received 304... Container '${this.name()}' is already running... Restarting container for safety`
        )
        const stopped = await this._container
          .stop()
          .then(() => true)
          .catch(err => {
            if (err === 304) {
              return true
            }
            return false
          })
        if (!stopped) {
          return false
        }
        await delay(3000)
        const started = await this._container
          .start()
          .then(() => true)
          .catch(() => false)
        if (!started) {
          return false
        }
      } else {
        if (err.statusCode === 404) {
          this.deactivate()
        }
        this._error('Cannot start container', this.name())
        this._info(err)
        this.setState('error')
      }
    }
    try {
      if (!noRestart) {
        this._restartCount = 0
      }
      this._attachLogsToContainer()
      const executed = await this._execModel()
      if (executed) {
        this._showEndpoints()
        return true
      }
    } catch (err) {
      this._error('Cannot start container', this.name())
      this._info(err)
      this.setState('error')
    }
    return false
  }

  async _crash() {
    try {
      this.setState('error')
      await this._container.stop()
      this._active = false
    } catch (err) {
      if (err.statusCode !== 304) {
        this._error('Cannot stop container', this.name())
        this._debug(err)
        this.setState('error')
      }
    }
  }

  async stop() {
    this._info(
      'HMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMmmmmmmmmmmmmmmmmmmmm',
      this.state
    )
    if (!this._container) {
      return
    }
    if (this.state !== 'running' && this.state !== 'stopping') {
      this._info(
        `Container '${this.name()}' is not running... Current state : ${
          this.state
        }`
      )
      return true
    }
    this._info(`Stopping container '${this.name()}'...`)
    try {
      this.setState('stopping')
      await this._container.stop()
      this.setState('stopped')
      return true
    } catch (err) {
      if (err.statusCode !== 304) {
        this._error('Cannot stop container', this.name())
        this._debug(err)
        this.setState('error')
      }
    }
    return false
  }

  async shutDown() {
    if (!this._container || this.state !== 'running') {
      return
    }
    this._info(`Stopping container '${this.name()}'...`)
    try {
      this._active = false
      await this._container.stop()
      return true
    } catch (err) {
      if (err.statusCode !== 304) {
        this._error('Cannot shut down container', this.name())
        this._debug(err)
        this.setState('error')
      }
    }
    return false
  }

  async repair() {
    this._info(`Repairing container '${this.name()}'...`)
    // Searching if container is already running and removing it if it is
    if (this._container) {
      this._info('Removing old container')
      try {
        await this._remove()
      } catch (err) {
        this._info('Could not remove old container')
      }
    }
    this._info('Restoring config...')
    const {
      createOptions: { mounts, ports, imageName, cmd, cores, maxRam }
    } = this.config
    const config = {
      HostConfig: {
        Binds: mounts,
        Memory: maxRam,
        CpuShares: cores,
        Privileged: true
      },
      Image: imageName,
      Cmd: cmd,
      Tty: true
    }
    if (ports) {
      config.HostConfig.PortBindings = {}
      config.ExposedPorts = {}
      ports.forEach(port => {
        config.HostConfig.PortBindings[`${port}/tcp`] = [
          { HostPort: `${port}` }
        ]
        config.ExposedPorts[`${port}/tcp`] = {}
      })
    }
    try {
      const container = await this._dockerMan.createContainer(config)
      this.activate(container)
      return true
    } catch (err) {
      this._error(`Could not repair container '${this.name()}'`)
      this._debug(err)
      this.setState('error')
    }
    return false
  }

  async _remove() {
    return this._container.remove({ force: true })
  }

  async remove(hard): Promise<boolean> {
    this._info(`Removing container '${this.name()}'...`)
    try {
      this.setState('removing')
      await this._remove()
      this.deactivate()
      if (hard) {
        this._removeMountDir()
        this._dockerMan.removeContainer(this.id())
      }
      return true
    } catch (err) {
      this._error(err.message)
      this.setState('removeFail')
      return false
    }
  }

  _attachLogsToContainer() {
    const logStream = new stream.PassThrough()
    logStream.on('data', chunk => {
      this._info(`container '${this.name()}':`, chunk.toString('utf-8'))
    })
    this._container.logs(
      {
        follow: true,
        stdout: true,
        stderr: true
      },
      (err, stream) => {
        if (err) {
          return this._error(err.message)
        }
        this._container.modem.demuxStream(stream, logStream, logStream)
        stream.on('end', () => {
          if (this._active) {
            if (
              this.state !== 'stopping' &&
              this.state !== 'starting' &&
              this.state !== 'removing'
            ) {
              this._error(`Unexpected stopping of container '${this.name()}'`)
              this.setState('error')
              // this.sync()
            }
          } else {
            this.setState('down')
          }
          logStream.end(`!stop container!`)
        })
      }
    )
  }

  _attachLogsToExec(execStream) {
    const logStream = new stream.PassThrough()
    logStream.on('data', chunk => {
      this._info(`model ${this.name()}: `, chunk.toString('utf-8'))
    })

    this._container.modem.demuxStream(execStream, logStream, logStream)
    execStream.on('end', () => {
      if (this._active) {
        if (
          this.state !== 'stopping' &&
          this.state !== 'starting' &&
          this.state !== 'removing'
        ) {
          this._error(`Unexpected stopping of model ${this.name()}`)
          setTimeout(() => this._restart(), 1000)
        }
      } else {
        this.setState('down')
      }
      logStream.end(`!stop exec!`)
    })
  }
}
