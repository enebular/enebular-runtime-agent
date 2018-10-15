/* @flow */

import fs from 'fs'
import path from 'path'
import util from 'util'
import crypto from 'crypto'
import { spawn } from 'child_process'
import rimraf from 'rimraf'
import request from 'request'
import progress from 'request-progress'
import objectHash from 'object-hash'
import { delay } from './utils'
import type DeviceStateManager from './device-state-manager'
import type AgentManagerMediator from './agent-manager-mediator'
import type { Logger } from 'winston'
import type Config from './config'

// todo: validate config

const moduleName = 'asset-man'

/**
 * Asset states:
 *   - notDeployed | deployed
 *   - deploying | deployFail
 *   - removing | removeFail
 */

/**
 * Reported asset states:
 *   - deployPending | deploying | deployed | deployFail
 *   - updatePending | updating | update-fail (todo)
 *   - removePending | removing | removeFail
 */

class Asset {
  _assetMan: AssetManager
  _type: string
  _id: string
  updateId: string
  config: {}
  state: string
  changeTs: string
  changeErrMsg: string
  pendingUpdateId: string
  pendingChange: string // (deploy|remove)
  pendingConfig: {}
  //  todo:
  //   - failCount

  constructor(
    type: string,
    id: string,
    updateId: string,
    config: {},
    state: string,
    assetMan: AssetManager
  ) {
    this._type = type
    this._id = id
    this.updateId = updateId
    this.config = config
    this.state = state
    this._assetMan = assetMan
    this.changeTs = Date.now()
  }

  _debug(msg: string, ...args: Array<mixed>) {
    this._assetMan._debug(msg, ...args)
  }

  _info(msg: string, ...args: Array<mixed>) {
    this._assetMan._info(msg, ...args)
  }

  _error(msg: string, ...args: Array<mixed>) {
    this._assetMan._error(msg, ...args)
  }

  _destDirPath() {
    return path.join(this._assetMan._dataDir, this.config.destPath)
  }

  type() {
    return this._type
  }

  id() {
    return this._id
  }

  name() {
    return this.config.name
  }

  setState(state: string) {
    this.state = state
    this.changeTs = Date.now()
  }

  setPendingChange(change: string, updateId: string, config: {}) {
    this.pendingChange = change
    this.pendingUpdateId = updateId
    this.pendingConfig = config
    this.changeErrMsg = null
    this.changeTs = Date.now()
  }

  serialize(): {} {
    return {
      type: this._type,
      id: this._id,
      updateId: this.updateId,
      state: this.state,
      changeTs: this.changeTs,
      changeErrMsg: this.changeErrMsg,
      config: this.config
    }
  }

  // todo: hooks exec

  _removeDestDir() {
    const destDir = this._destDirPath()
    if (fs.existsSync(destDir)) {
      this._debug('Removing asset directory: ' + destDir)
      rimraf.sync(destDir)
    }
  }

  async _runCommandHook(hook: {}) {
    this._info('Command: ' + hook.cmdTypeConfig.cmd)

    const cwd = this._assetMan._dataDir
    const that = this
    await new Promise((resolve, reject) => {
      const cproc = spawn(hook.cmdTypeConfig.cmd, [], {
        shell: true,
        stdio: 'pipe',
        cwd: cwd
      })
      const timeoutID = setTimeout(() => {
        that._info('Execution went over time limit')
        cproc.kill()
      }, hook.cmdTypeConfig.maxTime * 1000)
      cproc.stdout.on('data', data => {
        let str = data.toString().replace(/(\n|\r)+$/, '')
        that._info('Command output: ' + str)
      })
      cproc.stderr.on('data', data => {
        let str = data.toString().replace(/(\n|\r)+$/, '')
        that._info('Command output: ' + str)
      })
      cproc.on('error', err => {
        clearTimeout(timeoutID)
        reject(err)
      })
      cproc.once('exit', (code, signal) => {
        clearTimeout(timeoutID)
        if (code !== null) {
          if (code === 0) {
            resolve()
          } else {
            reject(new Error('Execution ended with failure exit code: ' + code))
          }
        } else {
          reject(new Error('Execution ended with signal: ' + signal))
        }
      })
    })

    this._debug('Command executed')
  }

  async _runHook(hook: {}) {
    this._info('Running hook...')

    switch (hook.type) {
      case 'cmd':
        await this._runCommandHook(hook)
        break
      default:
        throw new Error('Unsupported hook type: ' + hook.type)
    }

    this._info('Ran hook')
  }

  async _runHooks(stage: string) {
    if (!this.config.hooks) {
      return
    }
    for (let hook of this.config.hooks) {
      if (hook.stage !== stage) {
        continue
      }
      await this._runHook(hook)
    }
  }

  async deploy(): boolean {
    this._info(`Deploying asset '${this.name()}'...`)

    let cleanUpDestDir = true

    try {
      // Ensure dest directory exists
      const destDir = this._destDirPath()
      if (!fs.existsSync(destDir)) {
        this._debug('Creating directory for asset: ' + destDir)
        fs.mkdirSync(destDir)
      }

      // Pre-deploy hooks
      try {
        this._info('Running pre-deploy hooks...')
        await this._runHooks('preDeploy')
      } catch (err) {
        throw new Error('Failed to run pre-deploy hooks: ' + err.message)
      }
      this._info('Ran pre-deploy hooks')

      // Acquire
      try {
        this._info('Acquiring asset...')
        await this._acquire()
      } catch (err) {
        throw new Error('Failed to acquire asset: ' + err.message)
      }
      this._info('Acquired asset')

      // Verify
      try {
        this._info('Verifying asset...')
        await this._verify()
      } catch (err) {
        throw new Error('Failed to verify asset: ' + err.message)
      }
      this._info('Verified asset')

      // Install
      try {
        this._info('Installing asset...')
        await this._install()
      } catch (err) {
        throw new Error('Failed to install asset: ' + err.message)
      }
      this._info('Installed asset')

      cleanUpDestDir = false

      // Post-install
      try {
        this._info('Running post-install operations...')
        await this._runPostInstallOps()
      } catch (err) {
        throw new Error(
          'Failed to run post-install operations on asset: ' + err.message
        )
      }
      this._info('Ran post-install operations')

      // Post-deploy hooks
      try {
        this._info('Running post-deploy hooks...')
        await this._runHooks('postDeploy')
      } catch (err) {
        throw new Error('Failed to run post-deploy hooks: ' + err.message)
      }
      this._info('Ran post-deploy hooks')
    } catch (err) {
      this.changeErrMsg = err.message
      this._error(err.message)
      if (cleanUpDestDir) {
        this._removeDestDir()
      }
      return false
    }

    this._info(`Deployed asset '${this.name()}'`)

    return true
  }

  async _acquire() {
    throw new Error('Called an abstract function')
  }

  async _verify() {
    throw new Error('Called an abstract function')
  }

  async _install() {
    throw new Error('Called an abstract function')
  }

  async _runPostInstallOps() {
    throw new Error('Called an abstract function')
  }

  async remove(): boolean {
    this._info(`Removing asset '${this.name()}'...`)

    try {
      // Delete
      try {
        this._info('Deleting asset...')
        await this._delete()
      } catch (err) {
        throw new Error('Failed to delete asset: ' + err.message)
      }
      this._info('Deleted asset')

      // Clean up dest directory
      this._removeDestDir()
    } catch (err) {
      this.changeErrMsg = err.message
      this._error(err.message)
      return false
    }

    this._info(`Removed asset '${this.name()}'`)

    return true
  }

  async _delete() {
    throw new Error('Called an abstract function')
  }
}

class FileAsset extends Asset {
  _fileName() {
    return this.config.fileTypeConfig.filename
  }

  _filePath() {
    return path.join(this._destDirPath(), this.config.fileTypeConfig.filename)
  }

  _key() {
    return this.config.fileTypeConfig.internalSrcConfig.key
  }

  _execArgs() {
    return this.config.fileTypeConfig.execConfig.args
  }

  _execEnvs() {
    return this.config.fileTypeConfig.execConfig.envs
  }

  _execMaxTime() {
    return this.config.fileTypeConfig.execConfig.maxTime
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
    // Get asset file data download URL
    this._debug('Getting file download URL...')
    const url = await this._assetMan._agentMan.getInternalFileAssetDataUrl(
      this._key()
    )
    this._debug('Got file download URL')

    // Donwload asset file data
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
    this._debug(`Downloading ${url} to ${path} ...`)
    const that = this
    await new Promise(function(resolve, reject) {
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
        .pipe(fs.createWriteStream(path))
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
    this._debug('Integrity matched: ' + integrity)
  }

  async _install() {
    const mode = this.config.fileTypeConfig.exec ? 0o740 : 0o640
    fs.chmodSync(this._filePath(), mode)
  }

  _fileExecCmd(): string {
    const envs = this._execEnvs() ? this._execEnvs() : []
    return envs.concat([this._filePath(), this._execArgs()]).join(' ')
  }

  _execArgsArray() {
    let args = this._execArgs()
    return args ? args.split(/\s+/) : []
  }

  _execEnvObj() {
    const envs = this._execEnvs()
    let env = Object.assign({}, process.env)
    if (envs) {
      for (let e of envs) {
        let eComps = e.split('=')
        env[eComps[0]] = eComps[1]
      }
    }
    return env
  }

  async _execFile() {
    const args = this._execArgsArray()
    const env = this._execEnvObj()
    const cmd = this._fileExecCmd()
    const cwd = this._destDirPath()
    this._debug('Executing file...')
    this._debug('Command: ' + cmd)
    const that = this
    await new Promise((resolve, reject) => {
      const cproc = spawn(that._filePath(), args, {
        stdio: 'pipe',
        env: env,
        cwd: cwd
      })
      const timeoutID = setTimeout(() => {
        that._info('Execution went over time limit')
        cproc.kill()
      }, that._execMaxTime() * 1000)
      cproc.stdout.on('data', data => {
        let str = data.toString().replace(/(\n|\r)+$/, '')
        that._info('Asset: ' + str)
      })
      cproc.stderr.on('data', data => {
        let str = data.toString().replace(/(\n|\r)+$/, '')
        that._info('Asset: ' + str)
      })
      cproc.on('error', err => {
        clearTimeout(timeoutID)
        reject(err)
      })
      cproc.once('exit', (code, signal) => {
        clearTimeout(timeoutID)
        if (code !== null) {
          if (code === 0) {
            resolve()
          } else {
            reject(new Error('Execution ended with failure exit code: ' + code))
          }
        } else {
          reject(new Error('Execution ended with signal: ' + signal))
        }
      })
    })

    this._debug('Executed file')
  }

  async _runPostInstallOps() {
    if (this.config.fileTypeConfig.exec) {
      await this._execFile()
    }
  }

  async _delete() {
    const path = this._filePath()
    this._debug(`Deleting ${path}...`)
    fs.unlinkSync(path)
  }
}

export default class AssetManager {
  _deviceStateMan: DeviceStateManager
  _agentMan: AgentManagerMediator
  _log: Logger
  _assets: Array<Asset> = []
  _processingChanges: boolean = false
  _inited: boolean = false
  _active: boolean = false
  _dataDir: string
  _stateFilePath: string

  constructor(
    deviceStateMan: DeviceStateManager,
    agentMan: AgentManagerMediator,
    config: Config,
    log: Logger
  ) {
    this._dataDir = path.resolve(config.get('ENEBULAR_ASSETS_DATA_PATH'))
    this._stateFilePath = config.get('ENEBULAR_ASSETS_STATE_PATH')
    if (!this._dataDir || !this._stateFilePath) {
      throw new Error('Missing asset-man configuration')
    }

    this._deviceStateMan = deviceStateMan
    this._agentMan = agentMan
    this._log = log

    this._deviceStateMan.on('stateChange', params =>
      this._handleDeviceStateChange(params)
    )
  }

  _debug(msg: string, ...args: Array<mixed>) {
    args.push({ module: moduleName })
    this._log.debug(msg, ...args)
  }

  _info(msg: string, ...args: Array<mixed>) {
    args.push({ module: moduleName })
    this._log.info(msg, ...args)
  }

  _error(msg: string, ...args: Array<mixed>) {
    args.push({ module: moduleName })
    this._log.error(msg, ...args)
  }

  async setup() {
    if (this._inited) {
      return
    }

    this._debug('Asset data path: ' + this._dataDir)
    this._debug('Asset state file path: ' + this._stateFilePath)

    if (!fs.existsSync(this._dataDir)) {
      fs.mkdirSync(this._dataDir)
    }

    await this._initAssets()

    this._inited = true
  }

  async _initAssets() {
    this._loadAssets()
    this._updateAssetsFromDesiredState()
    this._updateAssetsReportedState()
  }

  _loadAssets() {
    if (!fs.existsSync(this._stateFilePath)) {
      return
    }

    this._info('Loading asset state: ' + this._stateFilePath)

    const data = fs.readFileSync(this._stateFilePath, 'utf8')
    let serializedAssets = JSON.parse(data)
    for (let serializedAsset of serializedAssets) {
      let asset = this._deserializeAsset(serializedAsset)
      this._assets.push(asset)
    }
  }

  _deserializeAsset(serializedAsset): Asset {
    switch (serializedAsset.type) {
      case 'file':
        break
      default:
        throw new Error('Unsupported asset type: ' + serializedAsset.type)
    }

    let asset = new FileAsset(
      serializedAsset.type,
      serializedAsset.id,
      serializedAsset.updateId,
      serializedAsset.config,
      serializedAsset.state,
      this
    )
    asset.changeTs = serializedAsset.changeTs
    asset.changeErrMsg = serializedAsset.changeErrMsg

    return asset
  }

  _saveAssetState() {
    this._debug('Saving asset state...')

    let serializedAssets = []
    for (let asset of this._assets) {
      switch (asset.state) {
        case 'deployed':
        case 'deployFail':
        case 'removeFail':
          serializedAssets.push(asset.serialize())
          break
        default:
          break
      }
    }
    this._debug('Asset state: ' + JSON.stringify(serializedAssets, null, '\t'))
    try {
      fs.writeFileSync(
        this._stateFilePath,
        JSON.stringify(serializedAssets),
        'utf8'
      )
    } catch (err) {
      this._error('Failed to save asset state: ' + err.message)
    }
  }

  async _handleDeviceStateChange(params) {
    if (!this._inited) {
      return
    }

    if (params.path && !params.path.startsWith('assets')) {
      return
    }

    switch (params.type) {
      case 'desired':
        this._updateAssetsFromDesiredState()
        break
      case 'reported':
        this._updateAssetsReportedState()
        break
      default:
        break
    }
  }

  async _updateAssetsFromDesiredState() {
    const desiredState = this._deviceStateMan.getState('desired', 'assets')
    if (!desiredState) {
      return
    }

    this._debug(
      'Assets state change: ' + JSON.stringify(desiredState, null, '\t')
    )

    const desiredAssets = desiredState.assets ? desiredState.assets : {}

    // Determine assets requiring a 'deploy' change
    let newAssets = []
    for (const desiredAssetId in desiredAssets) {
      if (!desiredAssets.hasOwnProperty(desiredAssetId)) {
        continue
      }
      let desiredAsset = desiredAssets[desiredAssetId]

      // Updates to existing assets
      let found = false
      for (let asset of this._assets) {
        if (asset.id() === desiredAssetId) {
          if (asset.updateId !== desiredAsset.updateId) {
            asset.setPendingChange(
              'deploy',
              desiredAsset.updateId,
              desiredAsset.config
            )
          }
          found = true
          break
        }
      }

      // New assets
      if (!found) {
        let asset = null
        switch (desiredAsset.config.type) {
          case 'file':
            asset = new FileAsset(
              desiredAsset.config.type,
              desiredAssetId,
              null,
              null,
              'notDeployed',
              this
            )
            asset.setPendingChange(
              'deploy',
              desiredAsset.updateId,
              desiredAsset.config
            )
            break
          default:
            this._error('Unsupported asset type: ' + desiredAsset.config.type)
            break
        }
        if (asset) {
          newAssets.push(asset)
        }
      }
    }

    // Determine assets requiring a 'remove change
    for (let asset of this._assets) {
      if (!desiredAssets.hasOwnProperty(asset.id())) {
        asset.setPendingChange('remove', null, null)
      }
    }

    // Append 'new' assets
    this._assets = this._assets.concat(newAssets)

    // this._debug('assets: ' + inspect(this._assets))

    this._updateAssetsReportedState()
    this._processPendingChanges()
  }

  _removeAssetReportedState(assetId) {
    this._debug(`Removing asset '${assetId}' reported state`)
    this._deviceStateMan.updateState(
      'reported',
      'remove',
      'assets.assets.' + assetId
    )
  }

  _getReportedAssetState(assetId: string): {} {
    const reportedState = this._deviceStateMan.getState('reported', 'assets')
    if (!reportedState || !reportedState.assets) {
      return null
    }

    return reportedState.assets[assetId]
  }

  // Only updates the reported state if required (if there is a difference)
  _updateAssetReportedState(asset) {
    // Create new reported state
    let state
    if (asset.pendingChange) {
      switch (asset.pendingChange) {
        case 'deploy':
          state = 'deployPending'
          break
        case 'remove':
          state = 'removePending'
          break
        default:
          state = 'unknown'
          break
      }
    } else {
      state = asset.state
    }
    let newStateObj = {
      ts: asset.changeTs,
      state: state
    }
    if (asset.changeErrMsg) {
      newStateObj.message = asset.changeErrMsg
    }
    newStateObj.updateId =
      asset.state === 'notDeployed' ? asset.pendingUpdateId : asset.updateId

    // Compare with currently reported state
    const currentStateObj = this._getReportedAssetState(asset.id())
    if (
      currentStateObj &&
      objectHash(currentStateObj) === objectHash(newStateObj)
    ) {
      this._debug(`Update of asset '${asset.id()}' reported state not required`)
      return
    }

    // Update if required
    this._debug(
      `Updating asset '${asset.id()}' reported state: ` +
        util.inspect(newStateObj)
    )
    this._deviceStateMan.updateState(
      'reported',
      'set',
      'assets.assets.' + asset.id(),
      newStateObj
    )
  }

  _updateAssetsReportedState() {
    const reportedState = this._deviceStateMan.getState('reported', 'assets')
    if (!reportedState) {
      return
    }

    this._debug(
      'Assets reported state: ' + JSON.stringify(reportedState, null, '\t')
    )

    if (reportedState.assets) {
      // Remove reported assets that no longer exist
      for (const reportedAssetId in reportedState.assets) {
        if (!reportedState.assets.hasOwnProperty(reportedAssetId)) {
          continue
        }
        let found = false
        for (let asset of this._assets) {
          if (asset.id() === reportedAssetId) {
            found = true
            break
          }
        }
        if (!found) {
          this._removeAssetReportedState(reportedAssetId)
        }
      }
    }

    // Update all current assets (if required)
    for (let asset of this._assets) {
      this._updateAssetReportedState(asset)
    }
  }

  _getFirstPendingChangeAsset(): Asset {
    if (this._assets.length < 1) {
      return null
    }
    for (let asset of this._assets) {
      if (asset.pendingChange) {
        return asset
      }
    }
    return null
  }

  _pendingChangeAssetExists(): boolean {
    return this._getFirstPendingChangeAsset() !== null
  }

  async _processPendingChanges() {
    if (!this._active || this._processingChanges) {
      return
    }
    this._processingChanges = true

    while (this._pendingChangeAssetExists()) {
      // Process simple 'remove' changes
      // todo: test this
      let removeAssets = this._assets.filter(asset => {
        return asset.pendingChange === 'remove' && asset.state === 'notDeployed'
      })
      this._assets = this._assets.filter(asset => {
        return !removeAssets.includes(asset)
      })
      for (let asset of removeAssets) {
        this._removeAssetReportedState(asset.id())
      }

      // Process remaining changes
      let asset = this._getFirstPendingChangeAsset()
      if (!asset) {
        continue
      }

      let pendingChange = asset.pendingChange
      asset.pendingChange = null

      switch (pendingChange) {
        case 'deploy':
          if (asset.state === 'deployed') {
            asset.setState('removing')
            this._updateAssetReportedState(asset)
            let success = await asset.remove()
            if (!success) {
              this._error('Remove failed, but contining with deploy...')
              asset.setState('removeFail')
              this._updateAssetReportedState(asset)
            }
          }
          asset.updateId = asset.pendingUpdateId
          asset.config = asset.pendingConfig
          asset.pendingConfig = null
          asset.setState('deploying')
          this._updateAssetReportedState(asset)
          let success = await asset.deploy()
          asset.setState(success ? 'deployed' : 'deployFail')
          this._updateAssetReportedState(asset)
          break

        case 'remove':
          if (asset.state === 'deployed') {
            asset.setState('removing')
            this._updateAssetReportedState(asset)
            let success = await asset.remove()
            if (!success) {
              asset.setState('removeFail')
              this._updateAssetReportedState(asset)
              break
            }
          }
          this._assets = this._assets.filter(a => {
            return a !== asset
          })
          this._removeAssetReportedState(asset.id())
          break

        default:
          this._error('Unsupported pending change: ' + pendingChange)
          break
      }

      this._saveAssetState()

      // A small deploy to guard against becoming a heavy duty busy loop
      await delay(2 * 1000)
    }

    this._processingChanges = false
  }

  activate(active: boolean) {
    if (active === this._active) {
      return
    }
    if (active && !this._inited) {
      throw new Error('Attempted to activate asset-man when not initialized')
    }
    this._active = active
    if (this._active) {
      this._processPendingChanges()
    }
  }
}
