/* @flow */
import fs from 'fs'
import EventEmitter from 'events'
import path from 'path'
import { spawn, type ChildProcess } from 'child_process'
import fetch from 'isomorphic-fetch'
import objectHash from 'object-hash'
import ProcessUtil, { type RetryInfo } from './process-util'
import { encryptCredential } from './utils'
import type { Logger } from 'winston'
import type LogManager from './log-manager'
import type DeviceStateManager from './device-state-manager'
import type Config from './config'

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
  _flowStateFilePath: string
  _flowState: Object
  _processingFlowStateChanges: boolean = false
  _dir: string
  _dataDir: string
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
    this._dir = nodeRedConfig.dir
    this._dataDir = nodeRedConfig.dataDir
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

    await this._initDeviceState()

    this._inited = true
  }

  async _initDeviceState() {
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
    this.debug('Saving flow state...')

    if (!this._flowState) {
      return
    }

    let flowState = Object.assign({}, this._flowState)

    // For in-progress type states, save their pre in-progress states
    switch (flowState.state) {
      case 'deploying':
        flowState.state = 'notDeployed'
        break
      case 'removing':
        flowState.state = 'deployed'
        break
      default:
        break
    }

    this.debug('Flow state: ' + JSON.stringify(flowState, null, 2))
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

  async _updateFlowFromDesiredState() {
    const desiredState = this._deviceStateMan.getState('desired', 'flow')
    if (!desiredState) {
      return
    }

    if (desiredState.flow) {
      this._flowState.controlSrc = 'deviceState'
    }

    this.debug('Assets state change: ' + JSON.stringify(desiredState, null, 2))

    const desiredFlow = desiredState.flow || {}

    let change = false
    if (!desiredFlow.hasOwnProperty('assetId') && this._flowState.assetId) {
      this._flowState.pendingChange = 'remove'
      this._flowState.changeTs = Date.now()
      change = true
    } else if (
      desiredFlow.assetId !== this._flowState.assetId ||
      desiredFlow.updateId !== this._flowState.updateId
    ) {
      this._flowState.pendingChange = 'deploy'
      this._flowState.pendingAssetId = desiredFlow.assetId
      this._flowState.pendingUpdateId = desiredFlow.updateId
      this._flowState.changeTs = Date.now()
      change = true
    }

    this.debug('Flow state: ' + JSON.stringify(this._flowState, null, 2))

    if (change) {
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
      !this._flowState.pendingAssetId &&
      reportedState.flow
    ) {
      this.debug('Removing reported flow state...')
      this._deviceStateMan.updateState('reported', 'remove', 'flow.flow')
    } else {
      let state = {
        assetId: this._flowState.assetId,
        updateId: this._flowState.updateId,
        state: this._flowState.state,
        ts: this._flowState.changeTs
      }
      if (this._flowState.changeErrMsg) {
        state.message = this._flowState.changeErrMsg
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

  async _processPendingFlowChanges() {
    if (this._processingChanges) {
      return
    }
    this._processingChanges = true

    while (this._active) {

      break
    }
    //

    this._processingChanges = false
  }

  _getDataDir() {
    return this._dataDir
  }

  _registerHandler(emitter: EventEmitter) {
    emitter.on('update-flow', params => this.fetchAndUpdateFlow(params))
    emitter.on('deploy', params => this.fetchAndUpdateFlow(params))
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
    await this._isProcessing
    this._isProcessing = null
  }

  async fetchAndUpdateFlow(params: { downloadUrl: string }) {
    this.flowState.controlSrc = 'cmd'
    return this._queueAction(() => this._fetchAndUpdateFlow(params))
  }

  async _fetchAndUpdateFlow(params: { downloadUrl: string }) {
    this.info('Updating flow')

    const flowPackage = await this._downloadPackage(params.downloadUrl)
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
          fs.writeFile(
            flowFilePath,
            JSON.stringify(flows),
            err => (err ? reject(err) : resolve())
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
              //const defaultKey =
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

          fs.writeFile(
            credFilePath,
            JSON.stringify(creds),
            err => (err ? reject(err) : resolve())
          )
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
          const packageJSON = JSON.stringify(
            {
              name: 'enebular-agent-dynamic-deps',
              version: '0.0.1',
              dependencies: flowPackage.packages
            },
            null,
            2
          )
          fs.writeFile(
            packageJSONFilePath,
            packageJSON,
            err => (err ? reject(err) : resolve())
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

  async startService(editSession: EditSession) {
    return this._queueAction(() => this._startService(editSession))
  }

  async _startService(editSession: EditSession) {
    if (editSession) {
      this.info('Starting service (editor mode)...')
    } else {
      this.info('Starting service...')
    }

    let executedLoadURL = false
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
      cproc.stdout.on('data', data => {
        let str = data.toString().replace(/(\n|\r)+$/, '')
        this._nodeRedLog.info(str)
        if (editSession && !executedLoadURL && str.includes('Started flows')) {
          this._nodeRedLog.info('Pinging enebular editor...')
          this._sendEditorAgentIPAddress(editSession)
          executedLoadURL = true
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
            this.info(
              'Unexpected exit, restarting service in 1 second. Retry count:' +
                this._retryInfo.retryCount
            )
            setTimeout(() => {
              this._startService(editSession)
            }, 1000)
          } else {
            this.info(
              `Unexpected exit, but retry count(${
                this._retryInfo.retryCount
              }) exceed max.`
            )
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
      setTimeout(() => resolve(), 1000)
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

  getStatus() {
    if (this._cproc) {
      return 'connected'
    } else {
      return 'disconnected'
    }
  }
}
