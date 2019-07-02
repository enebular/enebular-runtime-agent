/* @flow */

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import mkdirp from 'mkdirp'
import rimraf from 'rimraf'
import stringArgv from 'string-argv'
import { spawn } from 'child_process'

export default class Asset {
  _type: string
  _id: string
  updateId: string
  config: Object
  state: string
  changeTs: number
  changeErrMsg: ?string
  pendingUpdateId: ?string
  pendingChange: ?string // (deploy|remove)
  pendingConfig: ?Object
  updateAttemptCount: number = 0
  lastAttemptedUpdateId: ?string

  constructor(type: string, id: string) {
    this._type = type
    this._id = id
    this.changeTs = Date.now()
  }

  _debug(msg: string, ...args: Array<mixed>) {
    throw new Error('Called an abstract function')
  }

  _info(msg: string, ...args: Array<mixed>) {
    throw new Error('Called an abstract function')
  }

  _error(msg: string, ...args: Array<mixed>) {
    throw new Error('Called an abstract function')
  }

  _destDirPath(): string {
    throw new Error('Called an abstract function')
  }

  type(): string {
    return this._type
  }

  id(): string {
    return this._id
  }

  name(): string {
    return this.config.name
  }

  setState(state: string) {
    this.state = state
    this.changeTs = Date.now()
  }

  setPendingChange(change: string, updateId: ?string, config: ?Object) {
    let name = config ? config.name : null
    if (!name) {
      name = this.config ? this.config.name : this._id
    }
    this._info(`Asset '${name}' now pending '${change}'`)

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

  _removeDestDir() {
    if (!this.config.destPath) {
      return
    }
    const destDir = this._destDirPath()
    if (fs.existsSync(destDir) && fs.readdirSync(destDir).length === 0) {
      this._debug('Removing asset directory: ' + destDir)
      rimraf.sync(destDir)
    }
  }

  _execArgsArray(argsString: string): Array<string> {
    return argsString ? stringArgv(argsString) : []
  }

  _execEnvObj(envs: Array<string>): {} {
    let env = Object.assign({}, process.env)
    if (envs) {
      for (let e of envs) {
        let eComps = e.split('=')
        env[eComps[0]] = eComps.slice(1).join('=')
      }
    }
    return env
  }

  _execInCmdForm(cmd: string, args: string, envs: Array<string>): string {
    envs = envs || []
    return envs.concat([cmd, args]).join(' ')
  }

  async _runAssetHook(hook: Object) {
    this._info(
      'Asset command: ' +
        this._execInCmdForm(
          hook.assetTypeConfig.assetPath,
          hook.assetTypeConfig.args,
          hook.assetTypeConfig.envs
        )
    )

    const assetPath = path.join(
      this._assetMan.dataDir(),
      hook.assetTypeConfig.assetPath
    )
    // Check assetPath exists and chmod if necessary
    if (!fs.existsSync(assetPath)) {
      throw new Error("Asset doesn't exist")
    }
    const stats = fs.lstatSync(assetPath)
    const desiredPerm = 0o740
    if (stats.mode !== desiredPerm) {
      this._info('Changing asset file permissions to 740...')
      fs.chmodSync(assetPath, desiredPerm)
    }

    // Exec
    const args = this._execArgsArray(hook.assetTypeConfig.args)
    const env = this._execEnvObj(hook.assetTypeConfig.envs)
    const cwd = this._destDirPath()
    const that = this
    await new Promise((resolve, reject) => {
      const cproc = spawn(assetPath, args, {
        stdio: 'pipe',
        env: env,
        cwd: cwd
      })
      const timeoutID = setTimeout(() => {
        that._info('Asset execution went over time limit')
        cproc.kill()
      }, hook.maxTime * 1000)
      cproc.stdout.on('data', data => {
        let str = data.toString().replace(/(\n|\r)+$/, '')
        that._info('Asset output: ' + str)
      })
      cproc.stderr.on('data', data => {
        let str = data.toString().replace(/(\n|\r)+$/, '')
        that._info('Asset output: ' + str)
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
            reject(
              new Error('Asset execution ended with failure exit code: ' + code)
            )
          }
        } else {
          reject(new Error('Asset execution ended with signal: ' + signal))
        }
      })
    })

    this._debug('Asset executed')
  }

  async _runHook(hook: Object) {
    this._info(`Running '${hook.type}' hook...`)

    switch (hook.type) {
      case 'asset':
        await this._runAssetHook(hook)
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

  async deploy(): Promise<boolean> {
    this._info(`Deploying asset '${this.name()}'...`)

    let cleanUpDestDir = true

    try {
      // Ensure dest directory exists
      const destDir = this._destDirPath()
      if (!fs.existsSync(destDir)) {
        this._debug('Creating directory for asset: ' + destDir)
        mkdirp.sync(destDir)
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
        try {
          await this._delete()
          this._removeDestDir()
        } catch (err) {
          this._error('Failed to clean up asset: ' + err.message)
        }
      }
      return false
    }

    this._info(`Deployed asset '${this.name()}'`)

    return true
  }

  async remove(): Promise<boolean> {
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

  async _delete() {
    throw new Error('Called an abstract function')
  }
}
