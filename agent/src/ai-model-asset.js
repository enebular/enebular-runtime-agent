/* @flow */

import diskusage from 'diskusage'
import rimraf from 'rimraf'
import fs from 'fs'
import mkdirp from 'mkdirp'
import path from 'path'
import request from 'request'
import progress from 'request-progress'
import util from 'util'
import extract from 'extract-zip'
import Asset from './asset'
import type AiModelManager from './ai-model-manager'
import Container from './container'
import type { ContainerConfig } from './container'
import { delay } from './utils'

export default class AiModelAsset extends Asset {
  _aiModelMan: AiModelManager
  _port: number | null
  container: Container
  status: Object
  statusMessage: string
  endpoint: string
  enable: boolean = true
  pendingEnableRequest: boolean = false

  constructor(type: string, id: string, aiModelMan: AiModelManager) {
    super(type, id)
    this._aiModelMan = aiModelMan
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

  _fileName(): string {
    return this.config.aiModelTypeConfig.filename
  }

  _size(): string {
    return this.config.aiModelTypeConfig.size
  }

  _destDir(): string {
    return this.config.destPath
  }

  _destDirPath(): string {
    return path.join(this._aiModelMan.aiModelDir(), this.config.destPath)
  }

  _fileSubPath(): string {
    if (!this.config.destPath) {
      return this.config.aiModelTypeConfig.filename
    }
    return path.join(
      this.config.destPath,
      this.config.aiModelTypeConfig.filename
    )
  }

  _filePath(): string {
    return path.join(
      this._destDirPath(),
      this.config.aiModelTypeConfig.filename
    )
  }

  modelDir(): string {
    return this.config.destPath
  }

  dockerContainerId(): string | null {
    if (this.container) {
      return this.container.containerId()
    }
    return null
  }

  async getInstallationPort(): Promise<number> {
    if (!this._port) {
      if (this.getContainerPort()) {
        this._port = this.getContainerPort()
      } else {
        this._port = await this._aiModelMan.findFreePort()
      }
    }
    return this._port
  }

  getContainerPort(): number | null {
    if (this.container && this.container.port()) {
      return this.container.port()
    }
    return null
  }

  _containerMountPointPath(): string {
    return path.join(this._aiModelMan.mountDir(), this.modelDir())
  }

  _wrapperSubPath(): string {
    let mainFileDir = this._mainFilePath().split('.')
    if (mainFileDir.length <= 1) {
      return ''
    }
    mainFileDir = mainFileDir.slice(0, -1)
    return path.join(...mainFileDir)
  }

  _containerWrapperDirPath(): string {
    return path.join('/mount', this._wrapperSubPath())
  }

  _mainFileDir(): string {
    return path.join(this._containerMountPointPath(), this._wrapperSubPath())
  }

  _mountPointWrapperPath(): string {
    return path.join(
      this._containerMountPointPath(),
      this._wrapperSubPath(),
      'wrapper.py'
    )
  }

  _key(): string {
    return this.config.aiModelTypeConfig.internalSrcConfig.key
  }

  _handlers(): Array<Object> {
    return this.config.handlers
  }

  _cores(): number {
    return this.config.cores
  }

  _maxRam(): number {
    return this.config.maxRam
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

  isEnabled(): boolean {
    return this.enable || this.enable === undefined
  }

  isRunning(): boolean {
    return this.status === 'running'
  }

  setStatus(status: string, message: string) {
    this.status = status
    if (message) {
      this.statusMessage = message
    }
    this.changeTs = Date.now()
    this._aiModelMan.sync('status', this)
  }

  serialize(): {} {
    const serializedModel = {
      type: this._type,
      id: this._id,
      updateId: this.updateId,
      state: this.state,
      status: this.status,
      statusMessage: this.statusMessage,
      enable: this.enable,
      endpoint: this.endpoint,
      updateAttemptCount: this.updateAttemptCount,
      lastAttemptedUpdateId: this.lastAttemptedUpdateId,
      changeTs: this.changeTs,
      changeErrMsg: this.changeErrMsg,
      config: this.config,
      pendingChange: this.pendingChange,
      pendingUpdateId: this.pendingUpdateId,
      pendingConfig: this.pendingConfig,
      pendingEnableRequest: this.pendingEnableRequest
    }
    if (this.container && this.container.config) {
      serializedModel.containerConfig = this.container.config
    }
    return serializedModel
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

      delay(3000).then(() => this.container.start())
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
    this._port = null

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
    const url = await this._aiModelMan.agentMan.getInternalFileAssetDataUrl(
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
                `Error response: ${response.statusCode}: ${response.statusMessage}`
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
    if (integrity !== this.config.aiModelTypeConfig.integrity) {
      throw new Error(
        'File integrity mismatch: expected:' +
          this.config.aiModelTypeConfig.integrity +
          ', calculated:' +
          integrity
      )
    }
    this._info('File integrity matched: ' + integrity)
  }

  async _install() {
    fs.chmodSync(this._filePath(), 0o740)
    this._info('File installed to: ' + this._fileSubPath())

    const port = await this.getInstallationPort()

    this._info('Using port', port)

    // Extract archived model
    const path = this._filePath()
    const dest = this._containerMountPointPath()
    await new Promise((resolve, reject) => {
      this._info(`Extracting archive ${this._fileName()} to ${dest}...`)
      extract(path, { dir: dest }, err => {
        if (err) {
          this._error('Extraction failed', err.message)
          return reject(err)
        }
        this._info('Extraction complete')
        return resolve()
      })
    })

    // Downloading wrapper
    if (!fs.existsSync(this._mainFileDir())) {
      throw new Error('Path to main file is invalid')
    }

    const wrapper = await this._aiModelMan.agentMan.getAiModelWrapper({
      ...this.config,
      port
    })

    await new Promise((resolve, reject) => {
      const wrapperPath = this._mountPointWrapperPath()
      this._info(`Downloading wrapper to ${wrapperPath} ...`)
      fs.writeFile(wrapperPath, JSON.parse(wrapper), err => {
        if (err) {
          return reject(err)
        }
        return resolve()
      })
    })
  }

  async _runPostInstallOps() {
    this._info('Configuring Docker container...')

    await this.initContainer()
  }

  async initContainer() {
    const language = this._language()
    const command = `cd ${this._containerWrapperDirPath()} && ${language} wrapper.py`
    const port = await this.getInstallationPort()

    const config = {
      cmd: ['/bin/bash'],
      command: ['/bin/bash', '-c', command],
      mounts: [`${this._containerMountPointPath()}:/mount`],
      ports: [port],
      port: port,
      imageName: this._dockerImage(),
      cores: this._cores(),
      maxRam: this._maxRam() * 1024 * 1024
    }

    this.createContainerFromConfig(config)
    await this.container.init()
  }

  createContainerFromConfig(containerConfig: ContainerConfig) {
    this.container = new Container(this, this._aiModelMan, containerConfig)
  }

  async updateEndpoint() {
    const port = this.getContainerPort()
    const endpoint = `${this._aiModelMan.ipAddress()}:${port}`
    if (this.endpoint !== endpoint) {
      this.endpoint = endpoint
    }
  }

  enableRequest() {
    if (!this.pendingEnableRequest) {
      this.pendingEnableRequest = true
    }
  }

  async attemptDisable() {
    if (this.isRunning()) {
      this._info(`Disabling model ${this.name()}...`)
      if (this.container) {
        await this.container.stop()
      }
    }
  }

  async attemptEnable() {
    if (!this.isRunning()) {
      this._info(`Enabling model ${this.name()}...`)
      if (!this.container) {
        await this.initContainer()
      }
      await this.container.start()
    }
  }

  async shutDown() {
    if (this.container) {
      await this.container.shutDown()
    }
  }

  async _delete() {
    const destPath = this._destDirPath()
    if (fs.existsSync(destPath)) {
      this._debug(`Deleting ${destPath}...`)
      rimraf.sync(destPath)
    }
    if (this.container) {
      await this.container.remove()
    }
    const mountPath = this._containerMountPointPath()
    if (fs.existsSync(mountPath)) {
      this._debug(`Deleting ${mountPath}...`)
      rimraf.sync(mountPath)
    }
  }
}
