/** @flow */

import fs from 'fs'
import stream from 'stream'
import path from 'path'
import rimraf from 'rimraf'
import type AiModel from './ai-model'
import { delay } from './utils'

export default class Container {
  _active: boolean = false
  _model: AiModel
  _dockerMan: DockerManager
  _container: Object
  _exec: Object
  _id: string
  _restartCount: number = 0
  state: string
  changeTs: number
  changeErrMsg: ?string
  pendingUpdateId: ?string
  pendingChange: ?string // (deploy|remove)
  pendingConfig: ?Object
  updateAttemptCount: number = 0
  lastAttemptedUpdateId: ?string

  constructor(model: AiModel, dockerMan: DockerManager) {
    this._model = model
    this._dockerMan = dockerMan
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
    return this._model.id()
  }

  containerId(): string {
    return this._model.dockerConfig.containerId
  }

  name(): string {
    return this._model.name()
  }

  mountDir(): Number {
    return this._model.mountModelDir()
  }

  endpoint() {
    return this._model.endpoint
  }

  isActive(): boolean {
    return this._active
  }

  port(): string {
    return this.config.port
  }

  handlers() {
    return this._model.config.handlers
  }

  config(): Object {
    return this._model.dockerConfig
  }

  container(): Object {
    return this._container
  }

  activate(container: Object) {
    this._active = true
    this._container = container
    this._model.dockerConfig.containerId = container.id
  }

  deactivate() {
    this._active = false
    this._container = null
    this._model.dockerConfig.containerId = null
  }

  mountDirPath(): string {
    return path.join(this._dockerMan.mountDir(), this._model.config.destPath)
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
    }
  }

  setError(message, state) {
    this._error(message)
    if (state) {
      this.setState(state)
    } else {
      this.setState('error')
    }
    this._model.setStatusMessage(message)
  }

  sync() {
    this._model.setStatus(this.state)
  }

  setPendingChange(change: string, updateId: ?string) {
    this._info(`Container '${this.name()}' now pending '${change}'`)

    this.pendingChange = change
    this.pendingUpdateId = updateId
    this.changeErrMsg = null
    this.changeTs = Date.now()
  }

  removeMountDir() {
    if (!this.config().mountDir) {
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
      const { command } = this.config()
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
      this.setError(err.message)
    }
    return false
  }

  async _restart() {
    if (!this._active) {
      return
    }
    if (this._restartCount < 1) {
      this._restartCount++
      this._info(`Restart #${this._restartCount} of model '${this.name()}'...`)
      await this.repair()
      await this.start(true)
    } else {
      this.setError(
        `Exceeded maximum number of restarts of model '${this.name()}'...`
      )
      await this._crash()
    }
  }

  async start(noRestart) {
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
      this.setState('starting')
      this._model.updateEndpoint()
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
        this.setError(`Cannot start container ${this.name()}`)
        return false
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
        this.sync()
        return true
      }
    } catch (err) {
      this.setError(`Cannot start container ${this.name()}`)
      this.sync()
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
        this.setError(`Cannot stop container ${this.name()} in crashing`)
      }
    }
    this.sync()
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
      this.sync()
      return true
    } catch (err) {
      if (err.statusCode !== 304) {
        this.setError(`Cannot stop container ${this.name()}`)
      }
    }
    this.sync()
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
        this.setError(`Cannot shut down container ${this.name()}`)
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
        this.setState('removing')
        await this._remove()
        this.setState('removed')
      } catch (err) {
        this._info('Could not remove old container')
      }
    }
    this._info('Recreating container...')
    try {
      const { mounts, ports, imageName, cmd, cores, maxRam } = this.config()
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
      const container = await this._dockerMan.createContainer(config)
      if (!container) {
        throw new Error('Could not create a container')
      }
      this.activate(container)
      return true
    } catch (err) {
      this.setError(`Could not repair container '${this.name()}'`)
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
        this.removeMountDir()
      }
      return true
    } catch (err) {
      this.setError(err.message, 'removeFail')
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
              this.setError(`Unexpected stopping of container '${this.name()}'`)
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
          this._error(
            `Unexpected stopping of model ${this.name()}... Will try to restart...`
          )
          setTimeout(() => this._restart(), 1000)
        }
      } else {
        this.setState('down')
      }
      logStream.end(`!stop exec!`)
    })
  }
}
