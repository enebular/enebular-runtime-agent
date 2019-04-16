import fs from 'fs'
import stream from 'stream'
import path from 'path'
import rimraf from 'rimraf'
import mkdirp from 'mkdirp'
import { delay } from './utils'
import type DockerManager from './docker-manager'

export default class Exec {
  _active: boolean = false
  _dockerMan: DockerManager
  _container: Object
  _exec: Object
  _id: string
  _pid: number
  config: Object
  state: string
  changeTs: number
  changeErrMsg: ?string
  pendingUpdateId: ?string
  pendingChange: ?string
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

  name(): string {
    return this.config.name
  }

  cmd(): string {
    return this.config.cmd
  }

  language(): string {
    return this.config.language
  }

  mountDir(): string {
    return this.config.mountDir
  }

  handlers(): Array<object> {
    return this.config.handlers || []
  }

  mountDirPath(): string {
    return path.join(this._parent.mountDirPath(), this.config.mountDir)
  }

  canStart(): boolean {
    return (
      !this.state ||
      this.state === 'running' ||
      this.state === 'down' ||
      this.state === 'error'
    )
  }

  options(): Object {
    return this.config.options
  }

  exec(): Object {
    return this._exec
  }

  activate(exec: Object, container: Object) {
    this._active = true
    this._exec = exec
    this._parent = container
    this._container = container.container()
    this.config.parentId = container.id()
    this.config.endpoint = `${this._dockerMan.ipAddress()}:${this.config.port}`
  }

  deactivate() {
    this._active = false
    this._exec = null
    this.config.execId = null
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

  syncState(state: string) {
    this.setState(state)
    if (this._active) {
      this.sync()
    }
  }

  setPendingChange(change: string, updateId: ?string, config: ?Object) {
    this._info(`Exec '${this.name()}' now pending '${change}'`)

    this.pendingChange = change
    this.pendingUpdateId = updateId
    this.pendingConfig = config
    this.changeErrMsg = null
    this.changeTs = Date.now()
  }

  transfer(newId: string) {
    this.config.execId = newId
  }

  sync() {
    this._dockerMan.sync('exec', this)
  }

  async _start() {
    return new Promise((resolve, reject) => {
      this._exec.start((err, stream) => {
        if (err) {
          reject(err)
        }
        resolve(stream)
      })
    })
  }

  async _inspect() {
    return new Promise((resolve, reject) => {
      this._exec.inspect((err, data) => {
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
      message += handler + '\n'
    })
    this._info(message)
  }

  async start() {
    if (!this.canStart() || !this._container || !this._exec) {
      return
    }
    this._info(`Starting exec '${this.name()}'...`)
    try {
      this.syncState('starting')
      const stream = await this._start()
      this._attachLogs(stream)
    } catch (err) {
      this._error(err)
      this._error('Cannot start exec ', this.name())
      return false
    }
    this.syncState('running')
    // waiting for server to start
    await delay(3000)
    for (let i = 0; i < 3; i++) {
      this._info(`Searching for exec  ${this.name()} pid`)
      try {
        await this._getPid()
        if (this._pid) {
          break
        }
      } catch (err) {
        this._info(`Cannot get exec ${this.name()} pid, but will retry`)
      }
    }
    if (!this._pid) {
      this._error(`Cannot get exec pid`)
      this.syncState('error')
      return false
    }
    this._info('PID GOT ', this._pid)

    this._showEndpoints()
    return true
  }

  async _getPid() {
    if (this.state !== 'running') {
      return
    }
    this._debug(`Searching for pid of exec ${this.name()}`)
    const pid = await new Promise((resolve, reject) => {
      setTimeout(() => reject(new Error('Timeout')), 5000)
      this._container.exec(
        {
          Cmd: [
            '/bin/bash',
            '-c',
            `ps aux | grep ${this.language()} | grep -v grep | awk '{printf $2 "~"}'`
          ],
          AttachStdout: true,
          AttachStderr: true
        },
        (err, exec) => {
          if (err) {
            reject(err)
          }
          exec.start((err, execStream) => {
            if (err) {
              reject(err)
            }
            const logStream = new stream.PassThrough()
            logStream.on('data', chunk => {
              const pidArr = chunk.toString('utf-8').split('~')
              resolve(pidArr[pidArr.length - 2])
            })
            this._container.modem.demuxStream(execStream, logStream, logStream)
          })
        }
      )
    })
    if (!pid) {
      throw new Error(`Cannot get pid of exec ${this.name()}`)
    }
    this._pid = pid
  }

  async _stop() {
    return new Promise((resolve, reject) => {
      this._container.exec(
        {
          Cmd: ['/bin/bash', '-c', `kill -9 ${this._pid}`],
          AttachStdout: true,
          AttachStderr: true
        },
        (err, exec) => {
          if (err) {
            reject(err)
          }
          exec.start(err => {
            if (err) {
              reject(err)
            }
            resolve(true)
          })
        }
      )
    })
  }

  async stop() {
    if (
      !this._container ||
      !this._exec ||
      !this._pid ||
      this.state !== 'running'
    ) {
      return
    }
    this._info(`Stopping exec '${this.name()}'...`)
    try {
      this.setState('stopping')
      await this._stop()
      let inspect
      // asserting
      for (let i = 0; i < 3; i++) {
        await delay(i * 1000)
        inspect = await this._inspect()
        if (!inspect.Running) {
          break
        }
      }
      if (inspect.Running) {
        throw new Error('Exec still running')
      }
      this.syncState('stopped')
      return true
    } catch (err) {
      this._error(err)
      if (err.statusCode !== 304) {
        this._error('Cannot stop exec ', this.name())
      }
    }
    return false
  }

  async remove(hard): Promise<boolean> {
    if (!this._parent || !this._exec) {
      return
    }
    this._info(`Removing exec '${this.name()}'...`)
    try {
      if (this.state === 'running') {
        await this.stop()
      }
      this.syncState('removing')
      if (hard) {
        this._removeMountDir()
      }
      await this._parent.removeExec(this.id(), hard)
      this._dockerMan.removeExec(this.id())
      this.deactivate()
      return true
    } catch (err) {
      this._error(err.message)
      this.syncState('removeFail')
      return false
    }
  }

  _removeMountDir() {
    if (!this.mountDir()) {
      return
    }
    const mountDir = this.mountDirPath()
    if (fs.existsSync(mountDir)) {
      this._debug(`Removing exec ${this.name()} mount directory: ${mountDir}`)
      rimraf.sync(mountDir)
    }
  }

  _attachLogs(execStream) {
    const logStream = new stream.PassThrough()
    logStream.on('data', chunk => {
      this._info(`exec ${this.name()}: `, chunk.toString('utf-8'))
    })

    this._container.modem.demuxStream(execStream, logStream, logStream)
    execStream.on('end', () => {
      if (this._parent.isActive()) {
        if (this.state !== 'stopping' && this.state !== 'removing') {
          this._error(`Unexpected stopping of exec ${this.name()}`)
          this.syncState('error')
        }
      } else {
        this.syncState('down')
      }
      logStream.end(`!stop exec!`)
    })
  }
}
