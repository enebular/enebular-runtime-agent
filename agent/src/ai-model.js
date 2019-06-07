/* @flow */

import crypto from 'crypto'
import diskusage from 'diskusage'
import fs from 'fs'
import mkdirp from 'mkdirp'
import path from 'path'
import request from 'request'
import progress from 'request-progress'
import util from 'util'
import extract from 'extract-zip'
import Asset from './asset'
import type DockerManager from './docker-manager'
import Container from './container'
import { delay } from './utils'

export default class AiModel extends Asset {
  _dockerMan: DockerManager
  _port: string
  _mountDir: string
  container: Container
  dockerConfig: Object
  status: Object
  endpoint: string
  enabled: Boolean = true

  constructor(type: string, id: string, dockerMan: DockerManager) {
    super(type, id)
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

  _fileName(): string {
    return this.config.fileTypeConfig.filename
  }

  _size(): string {
    return this.config.fileTypeConfig.size
  }

  _destDir(): string {
    return this.config.destPath
  }

  _destDirPath(): string {
    return path.join(this._dockerMan.aiModelDir(), this.config.destPath)
  }

  _fileSubPath(): string {
    if (!this.config.destPath) {
      return this.config.fileTypeConfig.filename
    }
    return path.join(this.config.destPath, this.config.fileTypeConfig.filename)
  }

  _filePath(): string {
    return path.join(this._destDirPath(), this.config.fileTypeConfig.filename)
  }

  mountModelDir(): string {
    return this.config.destPath
  }

  port(): string {
    return this.dockerConfig.port
  }

  containerId(): string {
    return this.dockerConfig.containerId
  }

  _mountContainerDirPath(): string {
    return path.join(
      this._dockerMan.aiModelDir(),
      '.mount',
      this.mountModelDir()
    )
  }

  _wrapperSubPath(): string {
    let mainFileDir = this._mainFilePath().split('.')
    if (mainFileDir.length > 1) {
      mainFileDir = mainFileDir.slice(0, -1)
    }
    return path.join(...mainFileDir)
  }

  _containerWrapperDirPath(): string {
    return path.join('/mount', this._wrapperSubPath())
  }

  _mountWrapperPath(): string {
    return path.join(
      this._mountContainerDirPath(),
      this._wrapperSubPath(),
      'wrapper.py'
    )
  }

  _key(): string {
    return this.config.fileTypeConfig.internalSrcConfig.key
  }

  _handlers(): Array<Object> {
    return this.config.handlers
  }

  _isExistingContainerFlag(): boolean {
    return this.config.existingContainer
  }

  _cores(): number {
    return this.config.cores
  }

  _maxRam(): number {
    return this.config.maxRam
  }

  _cacheSize(): number {
    return this.config.cacheSize
  }

  _dockerImage(): string {
    return this.config.dockerImageUrl
  }

  _mainFilePath(): string {
    return this.config.mainFilePath
  }

  _language(): string {
    return this.config.language
  }

  _inputType(): boolean {
    return this.config.inputType
  }

  _wrapperUrl(): string {
    return this.config.wrapperUrl
  }

  canStart(): Boolean {
    return this.enabled
  }

  setStatus(status: string) {
    this.status = status
    this.changeTs = Date.now()
    this._dockerMan.sync('status', this)
  }

  serialize(): {} {
    return {
      type: this._type,
      id: this._id,
      updateId: this.updateId,
      state: this.state,
      status: this.status,
      enabled: this.enabled,
      endpoint: this.endpoint,
      updateAttemptCount: this.updateAttemptCount,
      lastAttemptedUpdateId: this.lastAttemptedUpdateId,
      changeTs: this.changeTs,
      changeErrMsg: this.changeErrMsg,
      config: this.config,
      dockerConfig: this.dockerConfig,
      pendingChange: this.pendingChange,
      pendingUpdateId: this.pendingUpdateId,
      pendingConfig: this.pendingConfig
    }
  }

  async _getIntegrity(path: string) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256')
      const file = fs.createReadStream(path)
      file.on('data', data => {
        hash.update(data)
      })
      file.on('end', () => {
        const digest = hash.digest('base64')
        resolve(digest)
      })
      file.on('error', err => {
        reject(err)
      })
    })
  }

  async deploy(): Promise<boolean> {
    this._info(`Deploying model '${this.name()}'...`)

    let cleanUpDestDir = true

    try {
      // Ensure dest directory exists
      const destDir = this._destDirPath()
      if (!fs.existsSync(destDir)) {
        this._debug('Creating directory for model: ' + destDir)
        mkdirp.sync(destDir)
      }

      // Acquire
      try {
        this._info('Acquiring model...')
        await this._acquire()
      } catch (err) {
        throw new Error('Failed to acquire model: ' + err.message)
      }
      this._info('Acquired model')

      // Verify
      try {
        this._info('Verifying model...')
        await this._verify()
      } catch (err) {
        throw new Error('Failed to verify model: ' + err.message)
      }
      this._info('Verified model')

      // Install
      try {
        this._info('Installing model...')
        await this._install()
      } catch (err) {
        throw new Error('Failed to install model: ' + err.message)
      }
      this._info('Installed model')

      cleanUpDestDir = false

      // Post-install
      try {
        this._info('Running post-install operations...')
        await this._runPostInstallOps()
      } catch (err) {
        throw new Error(
          'Failed to run post-install operations on model: ' + err.message
        )
      }
      this._info('Ran post-install operations')
    } catch (err) {
      this.changeErrMsg = err.message
      this._error(err.message)
      if (cleanUpDestDir) {
        try {
          await this._delete()
          this._removeDestDir()
        } catch (err) {
          this._error('Failed to clean up model: ' + err.message)
        }
      }
      return false
    }

    this._info(`Deployed model '${this.name()}'`)

    return true
  }

  async _acquire() {
    // Check FS free space
    this._debug('Checking free space...')
    let usageInfo
    try {
      usageInfo = diskusage.checkSync(this._destDirPath())
    } catch (err) {
      throw new Error('Failed to get free space: ' + err.message)
    }
    if (usageInfo.free < this._size()) {
      throw new Error(
        `Not enough storage space (available: ${
          usageInfo.free
        }B, required: ${this._size()}B)`
      )
    }

    // Get asset file data download URL
    this._debug('Getting file download URL...')
    const url = await this._dockerMan.agentMan.getInternalFileAssetDataUrl(
      this._key()
    )
    this._debug('Got file download URL')

    // Download asset file data
    const path = this._filePath()
    const onProgress = state => {
      this._info(
        util.format(
          'Download progress: %f%% @ %fKB/s, %fsec',
          state.percent ? Math.round(state.percent * 100) : 0,
          state.speed ? Math.round(state.speed / 1024) : 0,
          state.time.elapsed ? Math.round(state.time.elapsed) : 0
        )
      )
    }
    this._debug(`Downloading model ${url} to ${path} ...`)
    const that = this
    await new Promise(function(resolve, reject) {
      const fileStream = fs.createWriteStream(path)
      fileStream.on('error', err => {
        reject(err)
      })
      progress(request(url), {
        delay: 5000,
        throttle: 5000
      })
        .on('response', response => {
          that._debug(
            `Response: ${response.statusCode}: ${response.statusMessage}`
          )
          if (response.statusCode >= 400) {
            reject(
              new Error(
                `Error response: ${response.statusCode}: ${
                  response.statusMessage
                }`
              )
            )
          }
        })
        .on('progress', onProgress)
        .on('error', err => {
          reject(err)
        })
        .on('end', () => {
          resolve()
        })
        .pipe(fileStream)
    })
  }

  async _verify() {
    this._debug('Checking file integrity...')
    const integrity = await this._getIntegrity(this._filePath())
    if (integrity !== this.config.fileTypeConfig.integrity) {
      throw new Error(
        'File integrity mismatch: expected:' +
          this.config.fileTypeConfig.integrity +
          ', calculated:' +
          integrity
      )
    }
    this._info('File integrity matched: ' + integrity)
  }

  async _install() {
    fs.chmodSync(this._filePath(), 0o740)
    this._info('File installed to: ' + this._fileSubPath())

    this._info('Preparing container...')
    // const preparation = await this._dockerMan.prepare({
    //   modelId: this.id()
    // })
    // if (preparation.exist) {
    //   this._port = preparation.port
    // } else {
    this._port = await this._dockerMan.portMan.findFreePort()
    // }

    this._info('Using port', this._port)

    // Extract archived model
    const path = this._filePath()
    const dest = this._mountContainerDirPath()
    await new Promise((resolve, reject) => {
      this._info(`Extracting model ${this._fileName()} to ${dest}...`)
      extract(path, { dir: dest }, err => {
        if (err) {
          this._error('Extraction failed')
          reject(err)
        }
        this._info('Extraction complete')
        resolve()
      })
    })

    // Downloading wrapper
    // const that = this
    // const onProgress = state => {
    //   this._info(
    //     util.format(
    //       'Download progress: %f%% @ %fKB/s, %fsec',
    //       state.percent ? Math.round(state.percent * 100) : 0,
    //       state.speed ? Math.round(state.speed / 1024) : 0,
    //       state.time.elapsed ? Math.round(state.time.elapsed) : 0
    //     )
    //   )
    // }
    // const wrapperUrl = await this._dockerMan.agentMan.getAiModelWrapperUrl(
    //   {
    //     ...this.config,
    //     Port: this._port
    //   },
    //   this._dockerMan.isTestMode()
    // )
    // const wrapperPath = this._mountWrapperPath()
    // this._info(`Downloading wrapper to ${wrapperPath} ...`)
    // await new Promise(function(resolve, reject) {
    //   const fileStream = fs.createWriteStream(wrapperPath)
    //   fileStream.on('error', err => {
    //     reject(err)
    //   })
    //   progress(request(wrapperUrl), {
    //     delay: 5000,
    //     throttle: 5000
    //   })
    //     .on('response', response => {
    //       that._debug(
    //         `Response: ${response.statusCode}: ${response.statusMessage}`
    //       )
    //       if (response.statusCode >= 400) {
    //         reject(
    //           new Error(
    //             `Error response: ${response.statusCode}: ${
    //               response.statusMessage
    //             }`
    //           )
    //         )
    //       }
    //     })
    //     .on('progress', onProgress)
    //     .on('error', err => {
    //       reject(err)
    //     })
    //     .on('end', () => {
    //       resolve()
    //     })
    //     .pipe(fileStream)
    // })
  }

  async _runPostInstallOps() {
    this._info('Configuring  container...')

    await this.createContainer()

    delay(3000).then(() => this.container.start())

    // await container.newExec(
    //   {
    //     id: this.id(),
    //     name: this.name(),
    //     mountDir: this._destDir(),
    //     port: this._port,
    //     language: language,
    //     handlers: this._handlers()
    //   },
    //   {
    //     Cmd: ['/bin/bash', '-c', command],
    //     AttachStdout: true,
    //     AttachStderr: true,
    //     Privileged: true
    //   }
    // )
    // await this._dockerMan.exec(container, {
    //   Cmd: ['/bin/bash', '-c', command],
    //   AttachStdout: true,
    //   AttachStderr: true
    // })
  }

  async createContainer() {
    this._info(`Using image ${this._dockerImage()}...`)

    const language = this._language() === 'Python3' ? 'python3' : 'python2'
    const command = `cd ${this._containerWrapperDirPath()} && ${language} wrapper.py`

    const config = {
      cmd: ['/bin/bash'],
      command: ['/bin/bash', '-c', command],
      workDir: this._containerWrapperDirPath(),
      mounts: [`${this._mountContainerDirPath()}:/mount`],
      ports: [this._port],
      port: this._port,
      imageName: this._dockerImage(),
      cores: this._cores(),
      maxRam: this._maxRam() * 1024 * 1024
    }

    const container = await this._dockerMan.createNewContainer(config)

    this.container = new Container(this, this._dockerMan)
    this.dockerConfig = config

    this.container.activate(container)
  }

  async attachContainer(container) {
    this.container = new Container(this, this._dockerMan)

    this.container.activate(container)
  }

  async updateEndpoint() {
    const endpoint = `${this._dockerMan.ipAddress()}:${this.port()}`
    if (this.endpoint !== endpoint) {
      this.endpoint = endpoint
      // this._dockerMan.sync('endpoint', this)
    }
  }

  async _delete() {
    const filePath = this._filePath()
    if (fs.existsSync(filePath)) {
      this._debug(`Deleting ${filePath}...`)
      fs.unlinkSync(filePath)
    }
  }
}
