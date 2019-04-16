/* @flow */

import crypto from 'crypto'
import diskusage from 'diskusage'
import fs from 'fs'
import path from 'path'
import request from 'request'
import progress from 'request-progress'
import util from 'util'
import extract from 'extract-zip'
import rimraf from 'rimraf'
import Asset from './asset'
import type DockerManager from './docker-manager'
import type PortManager from './port-manager'
import type Container from './container'

export default class AiModel extends Asset {
  _port: string
  _ports: Array<string>
  _mountDir: string
  _container: Container

  _fileName(): string {
    return this.config.fileTypeConfig.filename
  }

  _size(): string {
    return this.config.fileTypeConfig.size
  }

  _destDir(): string {
    return this.config.destPath
  }

  /** @override */
  _destDirPath(): string {
    if (!this.config.destPath) {
      return this._assetMan.aiModelDir()
    }
    return path.join(this._assetMan.aiModelDir(), this.config.destPath)
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

  _mountModelDir(): string {
    return this._mountDir || this.config.destPath
  }

  _mountContainerDirPath(): string {
    return path.join(
      this._assetMan.aiModelDir(),
      '.mount',
      this._mountModelDir()
    )
  }

  _mountModelDirPath(): string {
    return path.join(this._mountContainerDirPath(), this.config.destPath)
  }

  _wrapperSubPath(): string {
    let mainFileDir = this._mainFilePath().split('.')
    if (mainFileDir.length > 1) {
      mainFileDir = mainFileDir.slice(0, -1)
    }
    return path.join(...mainFileDir)
  }

  _containerWrapperDirPath(): string {
    return path.join('/mount', this.config.destPath, this._wrapperSubPath())
  }

  _mountWrapperPath(): string {
    return path.join(
      this._mountModelDirPath(),
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

  _dockerMan(): DockerManager {
    return this._assetMan._dockerMan
  }

  _portMan(): PortManager {
    return this._assetMan._portMan
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
    const url = await this._assetMan.agentMan.getInternalFileAssetDataUrl(
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
    const preparation = await this._dockerMan().prepare({
      imageName: this._dockerImage(),
      modelId: this.id(),
      useExistingContainer: this._isExistingContainerFlag()
    })

    if (preparation.exist) {
      this._container = preparation.container
      this._mountDir = preparation.mountDir
      this._port = preparation.port
    } else {
      this._ports = await this._portMan().findFreePorts(this._cacheSize())
      this._port = this._ports[0]
    }
    this._info('Using port', this._port)

    // Extract archived model
    const path = this._filePath()
    const dest = this._mountModelDirPath()
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
    const that = this
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
    const wrapperUrl = await this._assetMan.agentMan.getAiModelWrapperUrl(
      {
        ...this.config,
        Port: this._port
      },
      this._dockerMan().isTestMode()
    )
    const wrapperPath = this._mountWrapperPath()
    this._info(`Downloading wrapper to ${wrapperPath} ...`)
    await new Promise(function(resolve, reject) {
      const fileStream = fs.createWriteStream(wrapperPath)
      fileStream.on('error', err => {
        reject(err)
      })
      progress(request(wrapperUrl), {
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

  async _runPostInstallOps() {
    this._info('Setting docker...')
    // this._dockerMan().listContainers()
    this._info(`Using image ${this._dockerImage()}...`)

    const language = this._language() === 'Python3' ? 'python3' : 'python2'
    const command = `cd ${this._containerWrapperDirPath()} && ${language} wrapper.py`
    // creating container
    let container
    if (this._container) {
      container = this._container
    } else {
      container = await this._dockerMan().createNewContainer(
        this._dockerImage(),
        {
          cmd: ['/bin/bash'],
          mounts: [`${this._mountContainerDirPath()}:/mount`],
          ports: this._ports
        },
        {
          modelId: this.id(),
          existingContainer: this._isExistingContainerFlag(),
          cacheSize: this._cacheSize(),
          mountDir: this._mountModelDir(),
          ports: this._ports,
          cmd: command
        }
      )
      await container.start()
    }
    await container.newExec(
      {
        id: this.id(),
        name: this.name(),
        mountDir: this._destDir(),
        port: this._port,
        language: language,
        handlers: this._handlers()
      },
      {
        Cmd: ['/bin/bash', '-c', command],
        AttachStdout: true,
        AttachStderr: true,
        Privileged: true
      }
    )
    // await this._dockerMan().exec(container, {
    //   Cmd: ['/bin/bash', '-c', command],
    //   AttachStdout: true,
    //   AttachStderr: true
    // })
  }

  async _delete() {
    const filePath = this._filePath()
    const mountPath = this._mountModelDirPath()
    if (fs.existsSync(filePath)) {
      this._debug(`Deleting ${filePath}...`)
      fs.unlinkSync(filePath)
    }
    if (fs.existsSync(mountPath)) {
      this._debug(`Deleting ${mountPath}...`)
      rimraf.sync(mountPath)
    }
  }
}
