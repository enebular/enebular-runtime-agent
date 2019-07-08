/* @flow */

import stream from 'stream'
import type AiModelAsset from './ai-model-asset'
import type AiModelManager from './ai-model-manager'
import { delay } from './utils'

export type ContainerConfig = {
  cmd: Array<string>,
  command: Array<string>,
  mounts: Array<string>,
  ports: Array<number>,
  port: number,
  imageName: string,
  cores: number,
  maxRam: number,
  containerId: string
}

export default class Container {
  _active: boolean = false
  _model: AiModelAsset
  _aiModelMan: AiModelManager
  _dockerContainer: Object
  config: ContainerConfig
  _exec: Object
  _restartCount: number = 0
  _restartAttemptsMax: number = 1
  state: string
  message: ?string

  constructor(
    model: AiModelAsset,
    aiModelMan: AiModelManager,
    config: ContainerConfig
  ) {
    this._model = model
    this._aiModelMan = aiModelMan
    this.config = config
  }

  _debug(msg: string, ...args: Array<mixed>) {
    this._aiModelMan.debug(msg, ...args)
  }

  _info(msg: string, ...args: Array<mixed>) {
    this._aiModelMan.info(msg, ...args)
  }

  _error(msg: string, ...args: Array<mixed>) {
    this._aiModelMan.error(msg, ...args)
  }

  containerId(): string {
    return this.config.containerId
  }

  port(): number | null {
    if (this.config) {
      return this.config.port
    }
    return null
  }

  name(): string {
    return this._model.name()
  }

  endpoint(): string {
    return this._model.endpoint
  }

  handlers(): Object {
    return this._model.config.handlers
  }

  activate(container: Docker.Container) {
    this._active = true
    this._dockerContainer = container
    this.config.containerId = container.id
  }

  deactivate() {
    this._active = false
    this._dockerContainer = null
    this.config.containerId = null
  }

  setState(state: string) {
    this.state = state
  }

  setErrorMessage(...args: Array<mixed>) {
    this._error(...args)
    this.message = args.join('\n')
    this.setState('error')
  }

  sync() {
    this._model.setStatus(this.state, this.message)
  }

  async _showHandlersEndpoints() {
    let message = `Model's ${this.name()} handler functions endpoint(s):\n`
    this.handlers().forEach(handler => {
      message += `'${handler.handlerFunc}' at ${this.endpoint()}/${
        handler.id
      }\n`
    })
    this._info(message)
  }

  async init(dockerContainer?: Docker.Container) {
    if (!dockerContainer) {
      dockerContainer = await this._aiModelMan.createContainer(this.config)
    }
    this.activate(dockerContainer)
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

  async _startServer(): Promise<boolean> {
    this._info(`Starting server for Model '${this.name()}'...`)
    try {
      const { command } = this.config
      const options = {
        Cmd: command,
        AttachStdout: true,
        AttachStderr: true,
        Privileged: true
      }
      this._exec = await this._dockerContainer.exec(options)
      const logStream = await this._startExec()
      this._attachLogsToExec(logStream)
      this.setState('running')
      return true
    } catch (err) {
      this.setErrorMessage(err.message)
    }
    return false
  }

  async _restart() {
    if (!this._active) {
      return
    }
    if (this._restartCount < this._restartAttemptsMax) {
      this._restartCount++
      this._info(`Restart #${this._restartCount} of model '${this.name()}'...`)
      await this.repair()
      await this.start(true)
    } else {
      this.setErrorMessage(
        `Exceeded maximum number of restarts of model '${this.name()}'...`
      )
      try {
        await this._dockerContainer.stop()
      } catch (err) {
        if (err.statusCode !== 304) {
          this.setErrorMessage(
            `Cannot stop container ${this.name()} in crashing`,
            err.message
          )
        }
      }
      this.sync()
    }
  }

  async start(noRestart?: boolean): Promise<boolean> {
    if (!this._active) {
      return false
    }
    if (!this._dockerContainer) {
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
      await this._model.updateEndpoint()
      await this._dockerContainer.start()
    } catch (err) {
      if (err.statusCode === 304) {
        this._info(
          `Received 304... Container '${this.name()}' is already running... Restarting container for safety`
        )
        const stopped = await this._dockerContainer
          .stop()
          .then(() => true)
          .catch(err => {
            if (err.statusCode === 304) {
              return true
            }
            this._error('Cannot stop a container', err.message)
            return false
          })
        if (!stopped) {
          return false
        }
        await delay(3000)
        const started = await this._dockerContainer
          .start()
          .then(() => true)
          .catch(err => {
            this._error(err.message)
            return false
          })
        if (!started) {
          return false
        }
      } else {
        if (err.statusCode === 404) {
          this.deactivate()
        }
        this.setErrorMessage(
          `Cannot start container ${this.name()}`,
          err.message
        )
        this.sync()
        return false
      }
    }
    try {
      if (!noRestart) {
        this._restartCount = 0
      }
      this._attachLogsToContainer()
      const executed = await this._startServer()
      if (executed) {
        this._showHandlersEndpoints()
        this.sync()
        return true
      }
    } catch (err) {
      this.setErrorMessage(`Cannot start container ${this.name()}`, err.message)
      this.sync()
    }
    return false
  }

  async stop(): Promise<boolean> {
    if (!this._dockerContainer) {
      return false
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
      await this._dockerContainer.stop()
      this.setState('stopped')
      this.sync()
      return true
    } catch (err) {
      if (err.statusCode !== 304) {
        this.setErrorMessage(
          `Cannot stop container ${this.name()}`,
          err.message
        )
      }
    }
    this.sync()
    return false
  }

  async shutDown(): Promise<boolean> {
    if (!this._dockerContainer || this.state !== 'running') {
      return false
    }
    this._info(`Stopping container '${this.name()}'...`)
    try {
      this._active = false
      await this._dockerContainer.stop()
      return true
    } catch (err) {
      if (err.statusCode !== 304) {
        this.setErrorMessage(
          `Cannot shut down container ${this.name()}`,
          err.message
        )
      }
    }
    return false
  }

  async repair(): Promise<boolean> {
    this._info(`Repairing container '${this.name()}'...`)
    // Searching if container is already running and removing it if it is
    if (this._dockerContainer) {
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
      await this.init()
      return true
    } catch (err) {
      this.setErrorMessage(
        `Could not repair container '${this.name()}'`,
        err.message
      )
    }
    return false
  }

  async _remove() {
    if (this._dockerContainer) {
      await this._dockerContainer.remove({ force: true })
    } else if (this.containerId()) {
      await this._aiModelMan.removeContainer(this.containerId())
    } else {
      this._info(`Nothing to remove for model ${this.name()}`)
    }
  }

  async remove(): Promise<boolean> {
    this._info(`Removing container '${this.name()}'...`)
    try {
      this.setState('removing')
      await this._remove()
      this.deactivate()
      return true
    } catch (err) {
      this.setErrorMessage(err.message)
      return false
    }
  }

  _attachLogsToContainer() {
    const logStream = new stream.PassThrough()
    logStream.on('data', chunk => {
      this._info(`container '${this.name()}':`, chunk.toString('utf-8'))
    })
    this._dockerContainer.logs(
      {
        follow: true,
        stdout: true,
        stderr: true
      },
      (err, stream) => {
        if (err) {
          return this._error(err.message)
        }
        this._dockerContainer.modem.demuxStream(stream, logStream, logStream)
        stream.on('end', () => {
          if (this._active) {
            if (
              this.state !== 'stopping' &&
              this.state !== 'starting' &&
              this.state !== 'removing'
            ) {
              this.setErrorMessage(
                `Unexpected stopping of container '${this.name()}'`
              )
            }
          } else {
            this.setState('down')
          }
          logStream.end(`!stop container!`)
        })
      }
    )
  }

  _attachLogsToExec(execStream: Object) {
    const logStream = new stream.PassThrough()
    logStream.on('data', chunk => {
      this._info(`model ${this.name()}: `, chunk.toString('utf-8'))
    })

    this._dockerContainer.modem.demuxStream(execStream, logStream, logStream)
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
