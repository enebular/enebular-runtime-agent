/* @flow */

import fs from 'fs'
import path from 'path'
import diskusage from 'diskusage'
import Asset from './asset'
import { progressRequest } from './utils'
import { execSpawn } from './utils'

export default class FileAsset extends Asset {
  _assetMan: AssetManager

  constructor(type: string, id: string, assetMan: AssetManager) {
    super(type, id)
    this._assetMan = assetMan
  }

  _debug(msg: string, ...args: Array<mixed>) {
    this._assetMan.debug(msg, ...args)
  }

  _info(msg: string, ...args: Array<mixed>) {
    this._assetMan.info(msg, ...args)
  }

  _error(msg: string, ...args: Array<mixed>) {
    this._assetMan.error(msg, ...args)
  }

  _destDirPath(): string {
    if (!this.config.destPath) {
      return this._assetMan.dataDir()
    }
    return path.join(this._assetMan.dataDir(), this.config.destPath)
  }

  _fileName(): string {
    return this.config.fileTypeConfig.filename
  }

  _size(): string {
    return this.config.fileTypeConfig.size
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

  _key(): string {
    return this.config.fileTypeConfig.internalSrcConfig.key
  }

  _execArgs(): string {
    return this.config.fileTypeConfig.execConfig.args
  }

  _execEnvs() {
    return this.config.fileTypeConfig.execConfig.envs
  }

  _execMaxTime() {
    return this.config.fileTypeConfig.execConfig.maxTime
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

    // Donwload asset file data
    const path = this._filePath()

    this._debug(`Downloading ${url} to ${path} ...`)

    await progressRequest(url, path, this)
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
    const mode = this.config.fileTypeConfig.exec ? 0o740 : 0o640
    fs.chmodSync(this._filePath(), mode)
    this._info('File installed to: ' + this._fileSubPath())
  }

  async _execFile() {
    this._info('Executing file...')
    this._info(
      'File command: ' +
        this._execInCmdForm(
          this._fileSubPath(),
          this._execArgs(),
          this._execEnvs()
        )
    )

    const args = this._execArgsArray(this._execArgs())
    const env = this._execEnvObj(this._execEnvs())
    const cwd = this._destDirPath()

    await execSpawn(args, env, cwd, this)

    this._debug('Executed file')
  }

  async _runPostInstallOps() {
    if (this.config.fileTypeConfig.exec) {
      await this._execFile()
    }
  }

  async _delete() {
    const path = this._filePath()
    if (fs.existsSync(path)) {
      this._debug(`Deleting ${path}...`)
      fs.unlinkSync(path)
    }
  }
}
