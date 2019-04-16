import fs from 'fs'
import stream from 'stream'
import path from 'path'
import rimraf from 'rimraf'
import mkdirp from 'mkdirp'
import type DockerManager from './docker-manager'
import Exec from './exec'

export default class Container {
  _active: boolean = false
  _dockerMan: DockerManager
  _container: Object
  _id: string
  _execs: Array<Exec> = []
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

  endpoint(port) {
    return `${this._dockerMan.ipAddress()}:${port}`
  }

  isActive(): boolean {
    return this._active
  }

  isOpen(): Boolean {
    return this.config.cacheSize > 1
  }

  canStart(): boolean {
    return (
      !this.state ||
      this.state === 'running' ||
      this.state === 'down' ||
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
    this.config.name = container.id.slice(0, 12)
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
    this.state = state
    if (this._active) {
      this.sync()
    }
  }

  setPendingChange(change: string, updateId: ?string, config: ?Object) {
    this._info(`Container '${this.name()}' now pending '${change}'`)

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

  addModel(key) {
    this.config.models.push(key)
    this.config.accept--
  }

  removeModel(key) {
    this.config.models = this.config.models.filter(modelId => modelId !== key)
    this.config.accept++
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
      if (err.statusCode === 404) {
        this.deactivate()
      }
      this._error('Cannot start container', this.name())
      this._info(err)
      this.setState('error')
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
      await this._stopExec()
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
      imageName,
      dockerOptions: { mounts, cmd, ports }
    } = this.config
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
      this._error(err)
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
          return this._error(err.message)
        }
        this._container.modem.demuxStream(stream, logStream, logStream)
        stream.on('end', () => {
          if (this.active) {
            if (this.state !== 'stopping') {
              this._error(`Unexpected stopping of container ${this.name()}`)
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

  async newExec(modelConfig, execOptions) {
    this._info(`Creating new exec to container '${this.name()}'...`)
    try {
      const newExec = new Exec(modelConfig.id, this._dockerMan)
      const baseEndpoint = this.endpoint(modelConfig.port)
      const endpoints = modelConfig.handlers.map(
        handler => `${handler.nodeTitle} at ${baseEndpoint}/${handler.id}`
      )
      const config = {
        name: modelConfig.name,
        language: modelConfig.language,
        mountDir: modelConfig.mountDir,
        port: modelConfig.port,
        endpoint: baseEndpoint,
        handlers: endpoints,
        options: execOptions
      }
      newExec.config = config
      const dockerExec = await this._container.exec(execOptions)
      newExec.activate(dockerExec, this)
      this.addModel(modelConfig.id)
      this._dockerMan.addExec(newExec)
      this._execs.push(newExec)
      this.sync()
      await newExec.start()
      // setTimeout(
      //   () =>
      //     this._container.top({ ps_args: 'aux' }, (err, data) => {
      //       if (err) {
      //         this._error('TOP ERROR', err)
      //       }
      //       this._info('TOP   ', data)
      //     }),
      //   10000
      // )
      // setTimeout(() => newExec.stop(), 5000)
      return true
    } catch (err) {
      this._error(err.message)
      return false
    }
  }

  async wakeExec(existingExec) {
    try {
      this._info(`Creating exec to container '${this.name()}'...`)
      const dockerExec = await this._container.exec(existingExec.options())
      existingExec.activate(dockerExec, this)
      this._execs.push(existingExec)
      await existingExec.start()
      return true
    } catch (err) {
      this._error(err.message)
      return false
    }
  }

  async removeExec(execId, hard) {
    this._execs = this._execs.filter(exec => exec.id() !== execId)
    this.removeModel(execId)
    if (hard && this._execs.length < 1) {
      await this.remove(hard)
    }
    this.sync()
  }

  async _stopExecs() {
    return Promise.all(this._execs.map(exec => exec.stop()))
  }

  _reshufflePorts() {
    this.config.ports.push(this.config.ports.shift())
  }

  async removeFirstExec() {
    const exec = this._execs.shift()
    this.removeModel(exec.id)
    this._reshufflePorts()
    this.sync()
    await exec.remove(true)
  }
}
