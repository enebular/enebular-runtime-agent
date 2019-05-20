/* @flow */
import fs from 'fs'
import EventEmitter from 'events'
import path from 'path'
import { spawn, type ChildProcess } from 'child_process'
import fetch from 'isomorphic-fetch'
import rimraf from 'rimraf'
import objectHash from 'object-hash'
import type { Logger } from 'winston'
import ProcessUtil, { type RetryInfo } from './process-util'
import type LogManager from './log-manager'
import {
  encryptCredential,
  delay,
  fsWriteFileAsync,
  fsReadFileAsync,
  fsCopyFileAsync,
  mkdirAsync,
  unlinkAsync,
  symlinkAsync,
  mkdirpAsync,
  createNodeDefinition
} from './utils'
import type DeviceStateManager from './device-state-manager'
import type ConnectorMessenger from './connector-messenger'
import type Config from './config'

// TODO:
//   - Improved this._flowState.changeErrMsg

export type NodeREDConfig = {
  dir: string,
  dataDir: string,
  command: string,
  killSignal: string,
  pidFile: string,
  assetsDataPath: string
}

const moduleName = 'node-red'

type EditSession = {
  ipAddress: string,
  sessionToken: string
}

type NodeRedFlowPackage = {
  flows: Object[],
  creds: Object,
  packages: Object,
  editSession?: EditSession
}

export default class NodeREDController {
  _deviceStateMan: DeviceStateManager
  _connectorMessenger: ConnectorMessenger
  _flowStateFilePath: string
  _flowState: Object
  _flowStateProcessingChanges: boolean = false
  _dir: string
  _dataDir: string
  _aiNodesDir: string
  _command: string
  _killSignal: string
  _pidFile: string
  _assetsDataPath: string
  _cproc: ?ChildProcess = null
  _actions: Array<() => Promise<any>> = []
  _isProcessing: ?Promise<void> = null
  _log: Logger
  _logManager: LogManager
  _nodeRedLog: Logger
  _retryInfo: RetryInfo
  _allowEditSessions: boolean = false
  _inited: boolean = false
  _active: boolean = false

  constructor(
    deviceStateMan: DeviceStateManager,
    connectorMessenger: ConnectorMessenger,
    emitter: EventEmitter,
    config: Config,
    log: Logger,
    logManager: LogManager,
    nodeRedConfig: NodeREDConfig
  ) {
    this._flowStateFilePath = config.get('ENEBULAR_FLOW_STATE_PATH')
    if (!this._flowStateFilePath) {
      throw new Error('Missing node-red controller configuration')
    }

    this._deviceStateMan = deviceStateMan
    this._connectorMessenger = connectorMessenger
    this._dir = nodeRedConfig.dir
    this._dataDir = nodeRedConfig.dataDir
    this._aiNodesDir = nodeRedConfig.aiNodesDir
    this._command = nodeRedConfig.command
    this._killSignal = nodeRedConfig.killSignal
    this._pidFile = nodeRedConfig.pidFile
    this._assetsDataPath = nodeRedConfig.assetsDataPath
    this._allowEditSessions = nodeRedConfig.allowEditSessions
    this._retryInfo = { retryCount: 0, lastRetryTimestamp: Date.now() }

    if (!fs.existsSync(this._dir)) {
      throw new Error(`The Node-RED directory was not found: ${this._dir}`)
    }
    if (!fs.existsSync(this._getDataDir())) {
      throw new Error(
        `The Node-RED data directory was not found: ${this._getDataDir()}`
      )
    }

    this._deviceStateMan.on('stateChange', params =>
      this._handleDeviceStateChange(params)
    )

    this._registerHandler(emitter)

    this._log = log
    this._logManager = logManager
    this._nodeRedLog = logManager.addLogger('service.node-red', [
      'console',
      'enebular',
      'file',
      'syslog'
    ])
  }

  debug(msg: string, ...args: Array<mixed>) {
    args.push({ module: moduleName })
    this._log.debug(msg, ...args)
  }

  info(msg: string, ...args: Array<mixed>) {
    args.push({ module: moduleName })
    this._log.info(msg, ...args)
  }

  error(msg: string, ...args: Array<mixed>) {
    args.push({ module: moduleName })
    this._log.error(msg, ...args)
  }

  activate(active: boolean) {
    if (active === this._active) {
      return
    }
    if (active && !this._inited) {
      throw new Error('Attempted to activate node-red-con when not initialized')
    }
    this._active = active
    if (this._active) {
      this._processPendingFlowChanges()
    }
  }

  async setup() {
    if (this._inited) {
      return
    }

    this.debug('Flow state file path: ' + this._flowStateFilePath)

    this._initDeviceState()

    this._inited = true
  }

  _initDeviceState() {
    this._loadFlowState()
    this._updateFlowFromDesiredState()
    this._updateFlowReportedState()
  }

  _loadFlowState() {
    if (!fs.existsSync(this._flowStateFilePath)) {
      this._flowState = {}
      return
    }

    this.info('Loading flow state: ' + this._flowStateFilePath)

    const data = fs.readFileSync(this._flowStateFilePath, 'utf8')
    this._flowState = JSON.parse(data)
  }

  _saveFlowState() {
    if (!this._flowState) {
      return
    }

    let flowState = Object.assign({}, this._flowState)

    // For in-progress type states, save their pre in-progress states
    switch (flowState.state) {
      case 'deploying':
        this.error('Attempted to save flow state while deploying')
        // TODO: do we really need notDeployed?
        flowState.state = 'notDeployed'
        break
      case 'removing':
        this.error('Attempted to save flow state while removing')
        flowState.state = 'deployed'
        break
      default:
        break
    }

    this.debug('Saving flow state: ' + JSON.stringify(flowState, null, 2))

    try {
      fs.writeFileSync(
        this._flowStateFilePath,
        JSON.stringify(flowState),
        'utf8'
      )
    } catch (err) {
      this.error('Failed to save flow state: ' + err.message)
    }
  }

  async _handleDeviceStateChange(params: { type: string, path: ?string }) {
    if (!this._inited) {
      return
    }

    if (params.path && !params.path.startsWith('flow')) {
      return
    }

    switch (params.type) {
      case 'desired':
        this._updateFlowFromDesiredState()
        break
      case 'reported':
        this._updateFlowReportedState()
        break
      default:
        break
    }
  }

  _updateFlowFromDesiredState() {
    const desiredState = this._deviceStateMan.getState('desired', 'flow')
    if (!desiredState) {
      return
    }

    const desiredFlow = desiredState.flow || {}

    this.debug('Desired state change: ' + JSON.stringify(desiredState, null, 2))

    let change = false

    if (!desiredFlow.hasOwnProperty('assetId')) {
      if (
        this._flowState.assetId &&
        this._flowState.pendingChange !== 'remove' &&
        this._flowState.state !== 'removing' &&
        this._flowState.state !== 'removeFail'
      ) {
        this.info(`Flow '${this._flowState.assetId}' now pending 'remove'`)
        this._flowState.pendingChange = 'remove'
        this._flowState.changeErrMsg = null
        this._flowState.changeTs = Date.now()
        change = true
      }
    } else {
      let deploy = false
      if (!this._flowState.pendingChange) {
        if (
          desiredFlow.assetId !== this._flowState.assetId ||
          desiredFlow.updateId !== this._flowState.updateId
        ) {
          deploy = true
        }
      } else {
        if (
          desiredFlow.assetId !== this._flowState.pendingAssetId ||
          desiredFlow.updateId !== this._flowState.pendingUpdateId
        ) {
          deploy = true
        }
      }
      if (deploy) {
        this.info(`Flow '${desiredFlow.assetId}' now pending 'deploy'`)
        this._flowState.pendingChange = 'deploy'
        this._flowState.pendingAssetId = desiredFlow.assetId
        this._flowState.pendingUpdateId = desiredFlow.updateId
        this._flowState.changeErrMsg = null
        this._flowState.changeTs = Date.now()
        change = true
      } else if (this._flowState.pendingChange === 'remove') {
        this._flowState.pendingChange = null
        this._flowState.changeErrMsg = null
        this._flowState.changeTs = Date.now()
        change = true
      }
    }

    this.debug('Flow state: ' + JSON.stringify(this._flowState, null, 2))

    if (change) {
      this._flowState.controlSrc = 'deviceState'
      this._updateFlowReportedState()
      this._processPendingFlowChanges()
    }
  }

  // Only updates the reported state if required (if there is a difference)
  _updateFlowReportedState() {
    if (!this._deviceStateMan.canUpdateState('reported')) {
      return
    }

    let reportedState = this._deviceStateMan.getState('reported', 'flow')
    if (!reportedState) {
      reportedState = {}
    }

    // Handle flow.flow
    if (
      !this._flowState.assetId &&
      !this._flowState.pendingChange &&
      reportedState.flow
    ) {
      this.debug('Removing reported flow state...')
      this._deviceStateMan.updateState('reported', 'remove', 'flow.flow')
    } else if (this._flowState.assetId || this._flowState.pendingChange) {
      let state = {
        assetId: this._flowState.assetId,
        updateId: this._flowState.updateId,
        state: this._flowState.state,
        ts: this._flowState.changeTs
      }
      if (this._flowState.pendingChange) {
        switch (this._flowState.pendingChange) {
          case 'deploy':
            state.state = 'deployPending'
            state.assetId = this._flowState.pendingAssetId
            state.updateId = this._flowState.pendingUpdateId
            break
          case 'remove':
            state.state = 'removePending'
            break
          default:
            state.state = 'unknown'
            break
        }
      }
      if (this._flowState.changeErrMsg) {
        state.message = this._flowState.changeErrMsg
      }
      if (
        !reportedState.flow ||
        objectHash(state) !== objectHash(reportedState.flow)
      ) {
        this.debug('Updating reported flow state...')
        this.debug(
          'Current state: ' + JSON.stringify(reportedState.flow, null, 2)
        )
        this.debug('New state: ' + JSON.stringify(state, null, 2))
        this._deviceStateMan.updateState('reported', 'set', 'flow.flow', state)
      }
    }
  }

  _setFlowState(state: string, msg: string) {
    this._flowState.state = state
    this._flowState.changeErrMsg = msg
    this._flowState.changeTs = Date.now()
    this._updateFlowReportedState()
  }

  async _processPendingFlowChanges() {
    if (this._flowStateProcessingChanges) {
      return
    }
    this._flowStateProcessingChanges = true

    while (this._active) {
      if (!this._flowState.pendingChange) {
        break
      }

      // Dequeue the pending change
      let pendingChange = this._flowState.pendingChange
      let pendingAssetId = this._flowState.pendingAssetId
      let pendingUpdateId = this._flowState.pendingUpdateId
      this._flowState.pendingChange = null
      this._flowState.pendingAssetId = null
      this._flowState.pendingUpdateId = null

      // Process the change
      let success
      switch (pendingChange) {
        case 'deploy':
          // Update attempt count handling
          if (
            pendingAssetId !== this._flowState.lastAttemptedAssetId ||
            pendingUpdateId !== this._flowState.lastAttemptedUpdateId
          ) {
            this._flowState.lastAttemptedAssetId = pendingAssetId
            this._flowState.lastAttemptedUpdateId = pendingUpdateId
            this._flowState.updateAttemptCount = 0
          }
          this._flowState.updateAttemptCount++
          this._saveFlowState()

          // Make the pending update the current one
          this._flowState.assetId = pendingAssetId
          this._flowState.updateId = pendingUpdateId

          // Handle too many attempts
          if (this._flowState.updateAttemptCount > 3) {
            this.info(`Deploy failed maximum number of times (3)`)
            this._flowState.updateAttemptCount = 0
            // TODO: better actual error message capture and reporting
            this._setFlowState('deployFail', 'Too many update attempts')
            break
          }

          // report deploying
          this._setFlowState('deploying', null)

          try {
            await this.removeFlow()
          } catch (err) {
            this.info('Existing flow remove failed: ' + err.message)
          }

          // deploy
          this.info(`Deploying flow '${pendingAssetId}'...`)
          try {
            const downloadUrl = await this._getFlowDataUrl(
              this._flowState.assetId,
              this._flowState.updateId
            )
            await this.fetchAndUpdateFlow(downloadUrl)
            this.info(`Deployed flow '${pendingAssetId}'`)
            this._flowState.updateAttemptCount = 0
            this._setFlowState('deployed', null)
          } catch (err) {
            this.error('Error occured during deploy: ' + err.message)
            if (this._flowState.pendingChange === null) {
              // TODO: handle too many attempts here too, not just above
              this.info(
                `Deploy failed, but will retry (${
                  this._flowState.updateAttemptCount
                }/3).`
              )
              this._flowState.assetId = null
              this._flowState.updateId = null
              this._flowState.pendingChange = 'deploy'
              this._flowState.pendingAssetId = pendingAssetId
              this._flowState.pendingUpdateId = pendingUpdateId
              this._setFlowState(null, null)
            } else {
              this.info('Deploy failed, but new change already pending.')
            }
          }
          break

        case 'remove':
          this.info(`Removing flow '${this._flowState.assetId}'...`)
          this._setFlowState('removing')
          try {
            await this.removeFlow()
            await this.restartService()
            this.info(`Removed flow '${this._flowState.assetId}'`)
            this._flowState.assetId = null
            this._flowState.updateId = null
            this._setFlowState(null, null)
          } catch (err) {
            this.info('Remove failed: ' + err.message)
            this._setFlowState('removeFail', 'Remove failed: ' + err.message)
          }
          break

        default:
          this.error('Unsupported pending change: ' + pendingChange)
          break
      }

      // Save the changed state
      this._saveFlowState()

      // A small delay to guard against becoming a heavy duty busy loop
      await delay(1 * 1000)
    }

    this._flowStateProcessingChanges = false
  }

  async _getFlowDataUrl(assetId: string, updateId: string) {
    this.info('Obtaining flow download URL...')
    const res = await this._connectorMessenger.sendRequest(
      'flow/device/getFlowDataUrl',
      {
        assetId,
        updateId
      }
    )
    return res.url
  }

  _getDataDir() {
    return this._dataDir
  }

  _getAiNodesDir() {
    return this._aiNodesDir
  }

  _registerHandler(emitter: EventEmitter) {
    emitter.on('update-flow', params => this.cmdFetchAndUpdateFlow(params))
    emitter.on('deploy', params => this.cmdFetchAndUpdateFlow(params))
    emitter.on('start', () => this.startService())
    emitter.on('restart', () => this.restartService())
    emitter.on('shutdown', () => {
      this.shutdownService()
    })
  }

  async _queueAction(fn: () => Promise<any>) {
    this.debug('Queuing action')
    this._actions.push(fn)
    if (this._isProcessing) {
      await this._isProcessing
    } else {
      await this._processActions()
    }
  }

  async _processActions() {
    this.debug('Processing actions:', this._actions.length)
    this._isProcessing = (async () => {
      while (this._actions.length > 0) {
        const action = this._actions.shift()
        await action()
      }
    })()
    try {
      await this._isProcessing
      this._isProcessing = null
    } catch (err) {
      while (this._actions.length > 0) {
        this._actions.pop()
      }
      this._isProcessing = null
      throw err
    }
  }

  async cmdFetchAndUpdateFlow(params: { downloadUrl: string }) {
    this._flowState.controlSrc = 'cmd'
    return this.fetchAndUpdateFlow(params.downloadUrl)
  }

  async fetchAndUpdateFlow(downloadUrl: string) {
    return this._queueAction(() => this._fetchAndUpdateFlow(downloadUrl))
  }

  async _fetchAndUpdateFlow(downloadUrl: string) {
    this.info('Updating flow')

    const flowPackage = await this._downloadPackage(downloadUrl)
    let editSessionRequested = this._flowPackageContainsEditSession(flowPackage)
    if (editSessionRequested && !this._allowEditSessions) {
      this.info('Edit session flow deploy requested but not allowed')
      this.info('Start agent in --dev-mode to allow edit session.')
      return
    }

    await this._updatePackage(flowPackage)
    if (editSessionRequested) {
      await this._restartInEditorMode(flowPackage.editSession)
    } else {
      await this._restartService()
    }
  }

  _flowPackageContainsEditSession(flowPackage: NodeRedFlowPackage) {
    if (
      flowPackage &&
      flowPackage.editSession &&
      flowPackage.editSession.ipAddress &&
      flowPackage.editSession.sessionToken
    ) {
      return true
    }
    return false
  }

  async _downloadPackage(downloadUrl: string): NodeRedFlowPackage {
    this.info('Downloading flow:', downloadUrl)
    const res = await fetch(downloadUrl)
    if (!res.ok) {
      throw new Error(`Failed response (${res.status} ${res.statusText})`)
    }
    return res.json()
  }

  async _updatePackage(flowPackage: NodeRedFlowPackage) {
    this.info('Updating package', flowPackage)
    const updates = []
    if (flowPackage.flow || flowPackage.flows) {
      const flows = flowPackage.flow || flowPackage.flows
      updates.push(
        new Promise((resolve, reject) => {
          const flowFilePath = path.join(this._getDataDir(), 'flows.json')
          fs.writeFile(flowFilePath, JSON.stringify(flows), err =>
            err ? reject(err) : resolve()
          )
        })
      )
    }
    if (flowPackage.cred || flowPackage.creds) {
      let creds = flowPackage.cred || flowPackage.creds
      updates.push(
        new Promise((resolve, reject) => {
          const credFilePath = path.join(this._getDataDir(), 'flows_cred.json')
          const editSessionRequested = this._flowPackageContainsEditSession(
            flowPackage
          )

          let settings
          if (editSessionRequested) {
            // enebular-editor remote deploy
            settings = require(path.join(
              this._getDataDir(),
              'enebular-editor-settings.js'
            ))
          } else {
            settings = require(path.join(this._getDataDir(), 'settings.js'))
          }
          if (settings.credentialSecret === false) {
            this.info('skip credential encryption')
          } else {
            this.info('credential encryption')
            try {
              const dotconfig = fs.readFileSync(
                path.join(this._getDataDir(), '.config.json'),
                'utf8'
              )

              // enebular-node-red dont see credentialSecret in settings.js
              // const defaultKey =
              //  settings.credentialSecret ||
              //  JSON.parse(dotconfig)._credentialSecret
              const defaultKey = JSON.parse(dotconfig)._credentialSecret

              creds = { $: encryptCredential(defaultKey, creds) }
            } catch (err) {
              throw new Error(
                'encrypt credential and create flows_cred.json failed',
                err
              )
            }
          }

          fs.writeFile(credFilePath, JSON.stringify(creds), err =>
            err ? reject(err) : resolve()
          )
        })
      )
    }
    if (flowPackage.handlers) {
      updates.push(
        new Promise(async (resolve, reject) => {
          const aiNodesDir = this._getAiNodesDir()
          const exist = fs.existsSync(aiNodesDir)
          if (exist) {
            rimraf.sync(aiNodesDir)
            rimraf.sync(
              path.join(
                this._getDataDir(),
                'node_modules',
                'enebular-ai-contrib*'
              )
            )
          }
          fs.mkdir(aiNodesDir, err => {
            if (err) {
              reject(err)
            }
            this._createAiNodes(flowPackage.handlers, aiNodesDir)
              .then(() => resolve())
              .catch(err => reject(err))
          })
        })
      )
    }
    if (flowPackage.packages) {
      updates.push(
        new Promise((resolve, reject) => {
          const packageJSONFilePath = path.join(
            this._getDataDir(),
            'enebular-agent-dynamic-deps',
            'package.json'
          )
          if (
            Object.keys(flowPackage.packages).includes(
              'node-red-contrib-enebular'
            )
          ) {
            flowPackage.packages['node-red-contrib-enebular'] =
              'file:../../node-red-contrib-enebular'
          }
          if (flowPackage.handlers) {
            Object.keys(flowPackage.handlers).forEach(handler => {
              flowPackage.packages[
                `enebular-ai-contrib-${handler}`
              ] = `file:../node-red-enebular-ai-nodes/${handler}`
            })
          }
          const packageJSON = JSON.stringify(
            {
              name: 'enebular-agent-dynamic-deps',
              version: '0.0.1',
              dependencies: flowPackage.packages
            },
            null,
            2
          )
          fs.writeFile(packageJSONFilePath, packageJSON, err =>
            err ? reject(err) : resolve()
          )
        })
      )
    }
    await Promise.all(updates)
    await this._resolveDependency()
  }

  async _resolveDependency() {
    return new Promise((resolve, reject) => {
      const cproc = spawn('npm', ['install', 'enebular-agent-dynamic-deps'], {
        stdio: 'inherit',
        cwd: this._getDataDir()
      })
      cproc.on('error', reject)
      cproc.once('exit', resolve)
    })
  }

  // async _installAiNodes(aiNodes, projectId) {
  //   const { nodes, ts } = aiNodes
  //   const aiNodesDir = path.resolve(this._getAiNodesDir(), projectId)
  //   const exist = fs.existsSync(path.resolve(aiNodesDir, '.config'))
  //   let keys
  //   if (!exist) {
  //     await mkdirpAsync(aiNodesDir)
  //     keys = await this._createAiNodes(nodes, aiNodesDir)
  //   } else {
  //     const oldConfig = await fsReadFileAsync(
  //       path.resolve(aiNodesDir, '.config'),
  //       'utf-8'
  //     )
  //     const jsonConfig = JSON.parse(oldConfig)
  //     if (Number(ts) === Number(jsonConfig.ts)) {
  //       keys = jsonConfig.keys
  //     } else {
  //       keys = await this._createAiNodes(nodes, aiNodesDir)
  //     }
  //   }
  //   const pkgJSON = await fsReadFileAsync(
  //     path.resolve(installDir, 'package.json'),
  //     'utf-8'
  //   )
  //   const pkg = JSON.parse(pkgJSON)
  //   const toInstall = {}
  //   keys.map(key => {
  //     toInstall[
  //       `enebular-ai-contrib-${key}`
  //     ] = `file:../../../node-red/node-red-enebular-ai-nodes/${projectId}/${key}`
  //     return symlinkAsync(
  //       path.resolve(this._getAiNodesDir(), projectId, key),
  //       path.resolve(installDir, 'node_modules', `enebular-ai-contrib-${key}`),
  //       'dir'
  //     )
  //   })
  //   pkg.dependencies = { ...pkg.dependencies, ...toInstall }
  //   await fsWriteFileAsync(
  //     path.resolve(installDir, 'package.json'),
  //     JSON.stringify(pkg, null, 2)
  //   )
  //   await fsWriteFileAsync(
  //     path.resolve(aiNodesDir, '.config'),
  //     JSON.stringify({ keys, ts })
  //   )
  // }

  async _createAiNodes(handlers, aiNodesDir) {
    const packageIds = Object.keys(handlers)
    await Promise.all(
      packageIds.map(async key => {
        const aiNodeDir = path.resolve(aiNodesDir, key)
        await mkdirAsync(aiNodeDir)
        await mkdirAsync(path.resolve(aiNodeDir, 'nodes'))
        return Promise.all(
          handlers[key].nodes.map(node =>
            createNodeDefinition(node, aiNodeDir, handlers[key].endpoint).then(
              () => node.id
            )
          )
        )
      })
    )
    await Promise.all(
      packageIds.map(async pkgId => {
        const aiNodeDir = path.resolve(aiNodesDir, pkgId)
        await mkdirAsync(path.resolve(aiNodeDir, 'icons'))
        await fsCopyFileAsync(
          path.resolve(this._getDataDir(), 'img', 'enebular_logo.svg'),
          path.resolve(aiNodeDir, 'icons', 'icon.svg')
        )
        const pkgNodes = handlers[pkgId].nodes.reduce((accum, node) => {
          accum[node.id] = `./nodes/${node.id}.js`
          return accum
        }, {})
        const packageJSON = `{"name":"enebular-ai-contrib-${pkgId}","version":"0.0.1","description":"A sample node for node-red","dependencies":{"request":"^2.88.0"},"keywords":["node-red"],"node-red":{"nodes":${JSON.stringify(
          pkgNodes
        )}}}`
        await fsWriteFileAsync(
          path.resolve(aiNodeDir, 'package.json'),
          packageJSON
        )
      })
    )
    return packageIds
  }

  _createPIDFile(pid: string) {
    try {
      fs.writeFileSync(this._pidFile, pid, 'utf8')
    } catch (err) {
      this._log.error(err)
    }
  }

  _removePIDFile() {
    if (!fs.existsSync(this._pidFile)) return

    try {
      fs.unlinkSync(this._pidFile)
    } catch (err) {
      this._log.error(err)
    }
  }

  async removeFlow() {
    return this._queueAction(() => this._removeFlow())
  }

  async _removeFlow() {
    this.info('Removing flow...')
    const flowFilePath = path.join(this._getDataDir(), 'flows.json')
    const credFilePath = path.join(this._getDataDir(), 'flows_cred.json')
    if (fs.existsSync(flowFilePath)) {
      this.debug(`Deleting ${flowFilePath}...`)
      fs.unlinkSync(flowFilePath)
    }
    if (fs.existsSync(credFilePath)) {
      this.debug(`Deleting ${credFilePath}...`)
      fs.unlinkSync(credFilePath)
    }
  }

  async startService(editSession: EditSession) {
    return this._queueAction(async () => {
      try {
        await this._startService(editSession)
      } catch (err) {
        this.error('Failed to start Node-RED service: ' + err.message)
      }
    })
  }

  async _startService(editSession: EditSession) {
    if (editSession) {
      this.info('Starting service (editor mode)...')
    } else {
      this.info('Starting service...')
    }

    let signaledSuccess = false
    return new Promise((resolve, reject) => {
      if (fs.existsSync(this._pidFile)) {
        ProcessUtil.killProcessByPIDFile(this._pidFile)
      }
      let [command, ...args] = this._command.split(/\s+/)
      let env = Object.assign(process.env, {
        ENEBULAR_ASSETS_DATA_PATH: this._assetsDataPath
      })
      if (editSession) {
        args = ['-s', '.node-red-config/enebular-editor-settings.js']
        env['ENEBULAR_EDITOR_URL'] = `http://${editSession.ipAddress}:9017`
        env['ENEBULAR_EDITOR_SESSION_TOKEN'] = editSession.sessionToken
      }
      const cproc = spawn(command, args, {
        stdio: 'pipe',
        cwd: this._dir,
        env: env
      })
      const startTimeout = setTimeout(() => {
        reject(new Error('Flow start timed out'))
      }, 30 * 1000)
      cproc.stdout.on('data', data => {
        let str = data.toString().replace(/(\n|\r)+$/, '')
        this._nodeRedLog.info(str)
        if (!signaledSuccess && str.includes('Started flows')) {
          signaledSuccess = true
          clearTimeout(startTimeout)
          if (editSession) {
            this._nodeRedLog.info('Pinging enebular editor...')
            this._sendEditorAgentIPAddress(editSession)
          }
          resolve()
        }
      })
      cproc.stderr.on('data', data => {
        let str = data.toString().replace(/(\n|\r)+$/, '')
        this._nodeRedLog.error(str)
      })
      cproc.once('exit', (code, signal) => {
        this.info(`Service exited (${code !== null ? code : signal})`)
        this._cproc = null
        /* Restart automatically on an abnormal exit. */
        if (code !== 0) {
          let shouldRetry = ProcessUtil.shouldRetryOnCrash(this._retryInfo)
          if (shouldRetry) {
            clearTimeout(startTimeout)
            this.info(
              'Unexpected exit, restarting service in 1 second. Retry count:' +
                this._retryInfo.retryCount
            )
            setTimeout(async () => {
              try {
                await this._startService(editSession)
                resolve()
              } catch (err) {
                reject(err)
              }
            }, 1000)
          } else {
            this.info(
              `Unexpected exit, but retry count(${
                this._retryInfo.retryCount
              }) exceed max.`
            )
            reject(new Error('Too many retry to start Node-RED service'))
            /* Other restart strategies (change port, etc.) could be tried here. */
          }
        }
        this._removePIDFile()
      })
      cproc.once('error', err => {
        this._cproc = null
        reject(err)
      })
      this._cproc = cproc
      if (this._cproc.pid) this._createPIDFile(this._cproc.pid.toString())
    })
  }

  async shutdownService() {
    return this._queueAction(() => this._shutdownService())
  }

  async _shutdownService() {
    return new Promise((resolve, reject) => {
      const cproc = this._cproc
      if (cproc) {
        this.info('Shutting down service...')
        cproc.once('exit', () => {
          this.info('Service ended')
          this._cproc = null
          resolve()
        })
        cproc.kill(this._killSignal)
      } else {
        this.info('Service already shutdown')
        resolve()
      }
    })
  }

  async _sendEditorAgentIPAddress(editSession: EditSession) {
    const { ipAddress, sessionToken } = editSession
    try {
      const res = await fetch(
        `http://${ipAddress}:9017/api/v1/agent-editor/ping`,
        {
          method: 'POST',
          headers: {
            'x-ee-session': sessionToken
          }
        }
      )
      if (!res.ok) {
        throw new Error(`Failed response (${res.status} ${res.statusText})`)
      }
    } catch (err) {
      this.error('Failed to ping editor: ' + err.message)
    }
  }

  async restartService() {
    return this._queueAction(() => this._restartService())
  }

  async _restartInEditorMode(editSession: EditSession) {
    this.info('Restarting service (editor mode)...')
    this.info(`enebular editor IP Address: ${editSession.ipAddress}`)
    await this._shutdownService()
    await this._startService(editSession)
  }

  async _restartService() {
    this.info('Restarting service...')
    await this._shutdownService()
    await this._startService()
  }
}
