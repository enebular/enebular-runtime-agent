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
    if (fs.existsSync(mountDir) && fs.readdirSync(mountDir).length === 0) {
      this._debug('Removing container mount directory: ' + mountDir)
      rimraf.sync(mountDir)
    }
  }

  async stop(): Promise<boolean> {
    this._info(`Stopping container '${this.id()}'...`)
  }

  async remove(): Promise<boolean> {
    this._info(`Removing container '${this.id()}'...`)
  }

  transfer(newId: string) {
    this.container.containerId = newId
  }

  addModel(config) {
    this.config.models.push({
      modelId: config.modelId,
      cmd: config.cmd
    })
    this.config.accept--
  }

  async start() {
    if (!this.canStart() || !this.this._container) {
      return
    }
    this._info(`Starting container '${this._id}'...`)
    try {
      await this.container().start()
      this._attachLogs()
    } catch (err) {
      this.error('Cannot start a container ', this._id)
    }
  }

  _attachLogs() {
    const logStream = new stream.PassThrough()
    logStream.on('data', chunk => {
      this.info('docker container: ', chunk.toString('utf-8'))
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
          if (this._active) {
            this.error('Unexpected stopping of a container')
            this.setState('error')
          } else {
            this.setState('sleep')
          }
          logStream.end('!stop container!')
        })
      }
    )
  }
}
