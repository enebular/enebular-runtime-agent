/* @flow */
import fs from 'fs-extra'
import path from 'path'
import { spawn, type ChildProcess } from 'child_process'
import fetch from 'isomorphic-fetch'
import objectHash from 'object-hash'
import ProcessUtil, { type RetryInfo } from './process-util'
import { encryptCredential, delay, execAsync } from './utils'
import { createAiNodeDefinition } from './createAiNodeDefinition'
import type { Logger } from 'winston'
import type LogManager from './log-manager'
import type DeviceStateManager from './device-state-manager'
import type DeviceCommandManager from './device-command-manager'
import type ConnectorMessenger from './connector-messenger'
import type Config from './config'

// TODO:
//   - Improved this._flowState.changeErrMsg

export type NodeREDConfig = {
  dir: string,
  dataDir: string,
  aiNodesDir: string,
  command: string,
  killSignal: string,
  pidFile: string,
  assetsDataPath: string,
  allowEditSessions: boolean
}

export type NodeREDAction = {
  promiseFunction: () => Promise<any>,
  resolve: (ret: any) => void,
  reject: () => void
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

type FlowStatus = {
  state: string,
  messenge?: string
}

type UpdatePackageResult = {
  success: boolean,
  message: ?string
}

type FlowFetchResult = {
  success: boolean,
  flowPackage: ?Object,
  message: ?string
}

export default class NodeREDController {
  _deviceStateMan: DeviceStateManager
  _deviceCommandMan: DeviceCommandManager
  _connectorMessenger: ConnectorMessenger
  _flowStateFilePath: string
  _flowStartTimeout: number
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
  _actions: Array<NodeREDAction> = []
  _currentAction: ?NodeREDAction = null
  _log: Logger
  _logManager: LogManager
  _nodeRedLog: Logger
  _retryInfo: RetryInfo
  _allowEditSessions: boolean = false
  _inited: boolean = false
  _active: boolean = false
  _shutdownRequested: boolean = false
  _flowStatus: FlowStatus = { state: 'stopped' }
  _pendingEnableRequest: boolean = false
  _pendingEnvVariablesRequest: boolean = false
  _stateAiModelsPath: string
  _cancelRequest: Object = {}
  _deployRequest: Array<Object> = []

  constructor(
    deviceStateMan: DeviceStateManager,
    deviceCommandMan: DeviceCommandManager,
    connectorMessenger: ConnectorMessenger,
    config: Config,
    log: Logger,
    logManager: LogManager,
    nodeRedConfig: NodeREDConfig
  ) {
    this._flowStartTimeout = config.get('ENEBULAR_NODE_RED_FLOW_START_TIMEOUT')
    this._flowStateFilePath = config.get('ENEBULAR_FLOW_STATE_PATH')
    this._stateAiModelsPath = config.get('ENEBULAR_AI_MODELS_STATE_PATH')
    if (!this._flowStateFilePath) {
      throw new Error('Missing node-red controller configuration')
    }

    this._deviceStateMan = deviceStateMan
    this._deviceCommandMan = deviceCommandMan
    this._connectorMessenger = connectorMessenger
    this._dir = nodeRedConfig.dir
    this._dataDir = nodeRedConfig.dataDir
    this._aiNodesDir = nodeRedConfig.aiNodesDir
    this._command = nodeRedConfig.command
    this._killSignal = nodeRedConfig.killSignal
    this._pidFile = nodeRedConfig.pidFile
    this._assetsDataPath = nodeRedConfig.assetsDataPath
    this._allowEditSessions = nodeRedConfig.allowEditSessions
    this._retryInfo = {
      retryCount: 0,
      lastRetryTimestamp: Date.now()
    }

    if (!fs.existsSync(this._dir)) {
      throw new Error(`The Node-RED directory was not found: ${this._dir}`)
    }
    if (!fs.existsSync(this._getDataDir())) {
      throw new Error(
        `The Node-RED data directory was not found: ${this._getDataDir()}`
      )
    }

    this._deviceStateMan.on('stateChange', (params) =>
      this._handleDeviceStateChange(params)
    )
    this._deviceCommandMan.on('command', (params) =>
      this._handleDeviceCommandSend(params)
    )

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
      case 'status':
        this._updateFlowStatusState()
        break
      default:
        break
    }
  }

  async _handleDeviceCommandSend(params: Object) {
    let result
    let message
    switch (params.op) {
      case 'deployCancel':
        try {
          await this._commandDeployCancel(params.body)
          result = 'canceled'
        } catch (err) {
          message = err.message
          result = 'cancelFail'
        }
        break
      default:
        this.info('Unsupported operation: ' + params.op)
        return
    }

    // send response
    const responseBody = {
      assetId: params.body.assetId,
      updateId: params.body.updateId,
      result: result
    }
    if (result === 'cancelFail') {
      responseBody.message = message
    }

    this._deviceCommandMan.sendCommandResponse(
      params.op,
      params.id,
      responseBody
    )
  }

  async _commandDeployCancel(body: Object) {
    let cancelIds = body

    if (!body.hasOwnProperty('assetId') || !body.hasOwnProperty('updateId')) {
      throw new Error('Parameter error')
    }

    if (this._deployRequest.length === 0) {
      throw new Error('Cancelable flow deploy request is none')
    }

    if (Object.keys(this._cancelRequest).length) {
      throw new Error('Cancel request is already')
    }

    if (this._isExistDeployRequest(cancelIds) === false) {
      throw new Error('No matching flow found')
    }

    // register cancel request
    this._cancelRequest = cancelIds

    // wait deploy cancel process
    await new Promise((resolve) => {
      const timer = setInterval(() => {
        if (this._isExistDeployRequest(cancelIds) === false) {
          clearInterval(timer)
          resolve()
        }
      }, 100)
    })
    if (!Object.keys(this._cancelRequest).length) {
      // cancel error occured
      throw new Error('deploy cancel error')
    }

    this._clearCancelRequest()
  }

  _clearCancelRequest() {
    this._cancelRequest = {}
  }

  _isExistDeployRequest(ids: Object): boolean {
    let isExist = false
    this._deployRequest.forEach((item) => {
      if (item.assetId === ids.assetId && item.updateId === ids.updateId) {
        isExist = true
      }
    })

    return isExist
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

    let enableRequest = false
    if (desiredState.hasOwnProperty('enable')) {
      if (this._flowState.enable !== desiredState.enable) {
        this._flowState.enable = desiredState.enable
        enableRequest = true
      }
    } else {
      // enable is undefined or false
      if (!this._flowState.enable) {
        // the default enable state is true
        this._flowState.enable = true
        enableRequest = true
      }
    }
    if (enableRequest) {
      this._flowState.enableDesiredStateRef = this._deviceStateMan.getRef(
        'desired',
        'flow.enable'
      )
      this._enableRequest()
      change = true
    }

    if (desiredState.hasOwnProperty('envVariables')) {
      this._flowState.pendingEnvVariables = desiredState.envVariables
      this._envVariableRequest()
      change = true
    }

    this.debug('Flow state: ' + JSON.stringify(this._flowState, null, 2))

    if (change) {
      this._flowState.controlSrc = 'deviceState'
      this._updateFlowStatusState()
      this._updateFlowReportedState()
      this._processPendingFlowChanges()
    }
  }

  _compareEnvVariables(envVariablesA: Object, envVariablesB: Object): boolean {
    if (!envVariablesA && !envVariablesB) {
      return true
    }
    if (!envVariablesA || !envVariablesB) {
      return false
    }

    if (
      Object.keys(envVariablesA).length !== Object.keys(envVariablesB).length
    ) {
      return false
    }

    for (const key in envVariablesA) {
      if (envVariablesA[key] !== envVariablesB[key]) {
        return false
      }
    }

    return true
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

    // Handle flow.enable
    if (this._flowState.enable !== reportedState.enable) {
      this.debug(
        `Updating reported flow enable ${reportedState.enable} => ${this._flowState.enable}`
      )
      this._deviceStateMan.updateState(
        'reported',
        'set',
        'flow.enable',
        this._flowState.enable,
        this._flowState.enableDesiredStateRef
          ? {
              desired: this._flowState.enableDesiredStateRef
            }
          : null
      )
    }
    // Handle flow.envVariables
    if (
      !this._compareEnvVariables(
        this._flowState.envVariables,
        reportedState.envVariables
      )
    ) {
      this.debug(
        `Updating reported flow envVariables ${reportedState.envVariables} => ${this._flowState.envVariables}`
      )
      this._deviceStateMan.updateState(
        'reported',
        'set',
        'flow.envVariablesA',
        this._flowState.envVariables
      )
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

  _setFlowState(state: ?string, msg: ?string) {
    this._flowState.state = state
    this._flowState.changeErrMsg = msg
    this._flowState.changeTs = Date.now()
    this._updateFlowReportedState()
  }

  _updateFlowStatusState() {
    if (!this._deviceStateMan.canUpdateState('status')) {
      return
    }

    let flowStatusState = this._deviceStateMan.getState('status', 'flow')
    if (!flowStatusState) {
      flowStatusState = {}
    }

    if (
      flowStatusState.state !== this._flowStatus.state ||
      flowStatusState.message !== this._flowStatus.message ||
      flowStatusState.controlSrc !== this._flowState.controlSrc
    ) {
      const state = {
        state: this._flowStatus.state,
        message: this._flowStatus.message,
        controlSrc: this._flowState.controlSrc
      }

      this.debug('Update flow status:' + JSON.stringify(state, null, 2))
      this._deviceStateMan.updateState('status', 'set', 'flow', state)
    }
  }

  _setFlowStatus(state: string, msg: ?string) {
    this._flowStatus.state = state
    this._flowStatus.message = msg
    this._updateFlowStatusState()
  }

  _envVariableRequest() {
    if (!this._pendingEnvVariablesRequest) {
      this._pendingEnvVariablesRequest = true
    }
  }

  _enableRequest() {
    if (!this._pendingEnableRequest) {
      this._pendingEnableRequest = true
    }
  }

  async _attemptEnvVariablesChange() {
    if (this._flowState.pendingEnvVariables) {
      let variablesToRemoveExists = false
      const newVariables = Object.keys(this._flowState.pendingEnvVariables)
      const variablesToRemove = []
      for (const variable in this._flowState.envVariables) {
        if (!newVariables.includes(variable)) {
          variablesToRemoveExists = true
          variablesToRemove.push(variable)
        }
      }
      if (variablesToRemoveExists) {
        this._flowState.envVariablesToRemote = variablesToRemove
      }
      this._flowState.envVariables = {
        ...this._flowState.pendingEnvVariables
      }
    } else {
      if (this._flowState.envVariables) {
        this._flowState.envVariablesToRemote = Object.keys(
          ...this._flowState.envVariables
        )
      }
      this._flowState.envVariables = null
    }
    this._flowState.pendingEnvVariables = null
    if (this._serviceIsRunning()) {
      this.info('Restarting service with new env variables')
      try {
        if (this._isFlowEnabled()) {
          await this._restartService()
        } else {
          this.info('Skipped Node-RED restart since flow is disabled')
        }
      } catch (err) {
        this.error(
          'Node-RED restart with new env variables failed: ' + err.message
        )
      }
    }
  }

  async _attemptEnableFlow() {
    if (!this._serviceIsRunning()) {
      this.info('Enabling flow')
      try {
        await this._startService()
      } catch (err) {
        this.error(
          'Enable flow failed, Node-RED failed to start: ' + err.message
        )
      }
    }
  }

  async _attemptDisableFlow() {
    if (this._serviceIsRunning()) {
      this.info('Disabling flow')
      try {
        await this._shutdownService()
      } catch (err) {
        this.error(
          'Disable flow failed, Node-RED failed to shutdown: ' + err.message
        )
      }
    }
  }

  async _processPendingFlowChanges() {
    if (this._flowStateProcessingChanges) {
      return
    }
    this._flowStateProcessingChanges = true

    while (this._active) {
      if (
        this._flowState.pendingChange == null &&
        !this._pendingEnableRequest &&
        !this._pendingEnvVariablesRequest
      ) {
        break
      }

      // Dequeue the pending change
      let pendingChange = this._flowState.pendingChange
      let pendingAssetId = this._flowState.pendingAssetId
      let pendingUpdateId = this._flowState.pendingUpdateId
      let pendingEnableRequest = this._pendingEnableRequest
      let pendingEnvVariablesRequest = this._pendingEnvVariablesRequest
      this._flowState.pendingChange = null
      this._flowState.pendingAssetId = null
      this._flowState.pendingUpdateId = null
      this._pendingEnableRequest = false
      this._pendingEnvVariablesRequest = false

      // Process the change
      if (pendingChange != null) {
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

            // Push flow info
            this._deployRequest.push({
              assetId: pendingAssetId,
              updateId: pendingUpdateId
            })

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

            // deploy
            this.info(`Deploying flow '${pendingAssetId}'...`)
            try {
              const downloadUrl = await this._getFlowDataUrl(
                this._flowState.assetId,
                this._flowState.updateId
              )
              const deployParam = {
                url: downloadUrl,
                assetId: this._flowState.assetId,
                updateId: this._flowState.updateId
              }
              const {
                success,
                message,
                flowPackage
              } = await this.fetchAndUpdateFlow(deployParam)
              // Flow update process is finished
              this._deployRequest.pop()

              if (!success) {
                // deploy cancel
                this.info('deploy error', message)
                this._flowState.updateAttemptCount = 0
                this._setFlowState('deployFail', message)
              } else {
                if (this._flowPackageContainsEditSession(flowPackage)) {
                  await this._restartInEditorMode(flowPackage.editSession)
                } else {
                  if (this._isFlowEnabled()) {
                    await this._restartService()
                  } else {
                    this.info('Skipped Node-RED restart since flow is disabled')
                  }
                }

                this.info(`Deployed flow '${pendingAssetId}'`)
                this._flowState.updateAttemptCount = 0
                this._setFlowState('deployed', null)
              }
            } catch (err) {
              this.error('Error occured during deploy: ' + err.message)
              if (this._flowState.pendingChange === null) {
                // TODO: handle too many attempts here too, not just above
                this.info(
                  `Deploy failed, but will retry (${this._flowState.updateAttemptCount}/3).`
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
              this._deployRequest.pop()
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
      }

      if (pendingEnableRequest) {
        this.info('Processing flow enable change')
        if (this._isFlowEnabled()) {
          await this._attemptEnableFlow()
        } else {
          await this._attemptDisableFlow()
        }
      }

      if (pendingEnvVariablesRequest) {
        this.info('Processing flow env variables change')
        await this._attemptEnvVariablesChange()
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

  _isFlowEnabled(): boolean {
    return this._flowState.enable || this._flowState.enable === undefined
  }

  async _queueAction(promiseFunction: () => Promise<any>) {
    return new Promise((resolve, reject) => {
      this.debug('Queuing action')
      this._actions.push({
        promiseFunction: promiseFunction,
        resolve: resolve,
        reject: reject
      })

      if (!this._currentAction) {
        this._processNextAction()
      }
    })
  }

  async _processNextAction() {
    this._currentAction = this._actions.shift()
    if (!this._currentAction) {
      return false
    }

    this.debug('Pending promises count:', this._actions.length + 1)

    try {
      const ret = await this._currentAction.promiseFunction()
      this._currentAction.resolve(ret)
      this._processNextAction()
    } catch (err) {
      this._currentAction.reject(err)
      this._processNextAction()
    }
    return true
  }

  async fetchAndUpdateFlow(deployParam: Object): Promise<FlowFetchResult> {
    return this._queueAction(() => this._fetchAndUpdateFlow(deployParam))
  }

  async _fetchAndUpdateFlow(deployParam: Object): Promise<FlowFetchResult> {
    this.info('Updating flow')

    let flowPackage = await this._downloadPackage(deployParam.url)
    let editSessionRequested = this._flowPackageContainsEditSession(flowPackage)
    if (editSessionRequested && !this._allowEditSessions) {
      this.info('Edit session flow deploy requested but not allowed')
      throw new Error('Start agent in --dev-mode to allow edit session.')
    }

    let result = await this._updatePackage(flowPackage, deployParam)
    if (result.success === false) {
      // cancel occurred
      return result
    }
    return {
      success: true,
      flowPackage
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

  async _downloadPackage(downloadUrl: string): Promise<NodeRedFlowPackage> {
    this.info('Downloading flow:', downloadUrl)
    const res = await fetch(downloadUrl)
    if (!res.ok) {
      throw new Error(`Failed response (${res.status} ${res.statusText})`)
    }
    return res.json()
  }

  async _updatePackage(
    flowPackage: NodeRedFlowPackage,
    deployParam: Object
  ): Promise<UpdatePackageResult> {
    const { cred, ...logFlowPackage } = flowPackage

    this.info('Updating package', logFlowPackage)
    const updates = []
    if (flowPackage.flow || flowPackage.flows) {
      const flows = flowPackage.flow || flowPackage.flows
      updates.push(
        new Promise((resolve, reject) => {
          const flowFilePath = path.join(this._getDataDir(), 'new-flows.json')
          fs.writeFile(flowFilePath, JSON.stringify(flows), (err) =>
            err ? resolve(new Error(err)) : resolve(null)
          )
        })
      )
    }
    if (flowPackage.cred || flowPackage.creds) {
      let creds = flowPackage.cred || flowPackage.creds
      updates.push(
        new Promise((resolve, reject) => {
          const credFilePath = path.join(
            this._getDataDir(),
            'new-flows_cred.json'
          )
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
              // when loading flow credential secret is stored in runtime config
              const dotconfig = fs.readFileSync(
                path.join(this._getDataDir(), '.config.runtime.json'),
                'utf8'
              )

              // enebular-node-red dont see credentialSecret in settings.js
              // const defaultKey =
              //  settings.credentialSecret ||
              //  JSON.parse(dotconfig)._credentialSecret
              const defaultKey = JSON.parse(dotconfig)._credentialSecret

              creds = { $: encryptCredential(defaultKey, creds) }
            } catch (err) {
              resolve(
                new Error(
                  'encrypt credential and create flows_cred.json failed'
                )
              )
            }
          }
          fs.writeFile(credFilePath, JSON.stringify(creds), (err) =>
            err ? resolve(new Error(err)) : resolve(null)
          )
        })
      )
    }
    if (flowPackage.handlers) {
      updates.push(
        new Promise(async (resolve, reject) => {
          const aiNodesDir = this._getAiNodesDir()
          createAiNodeDefinition(
            flowPackage.handlers,
            aiNodesDir,
            this._stateAiModelsPath
          )
            .then(() => resolve(null))
            .catch((err) => resolve(new Error(err)))
        })
      )
    }
    updates.push(
      new Promise(async (resolve, reject) => {
        const aiPackageJSONFilePath = path.join(
          this._getDataDir(),
          'node-red-enebular-ai-nodes',
          'new-package.json'
        )
        let nodeType = 'default'
        if (flowPackage.handlers) {
          nodeType = 'nodes'
        }
        const aiPackageJSON = JSON.stringify(
          {
            name: '@uhuru/enebular-ai-contrib',
            version: '0.0.2',
            description: 'A node to work with enebular AI Models',
            dependencies: {
              request: '^2.88.0'
            },
            keywords: ['node-red'],
            'node-red': {
              nodes: {
                'enebular-ai-node': `./${nodeType}/enebular-ai-node.js`
              }
            }
          },
          null,
          2
        )
        fs.writeFile(aiPackageJSONFilePath, aiPackageJSON, (err) =>
          err ? resolve(new Error(err)) : resolve(null)
        )
      })
    )
    if (flowPackage.packages) {
      updates.push(
        new Promise((resolve, reject) => {
          const packageJSONFilePath = path.join(
            this._getDataDir(),
            'enebular-agent-dynamic-deps',
            'package.json'
          )
          const nodeRedFilePath = path.join(
            this._getDataDir(),
            '.config.users.json'
          )
          const defaultPackageJSONFilePath = path.join(
            this._getDataDir(),
            'package.json'
          )

          if (fs.existsSync(nodeRedFilePath)) {
            const packageJSONFile = JSON.parse(
              fs.readFileSync(packageJSONFilePath, 'utf8')
            )
            const nodeRedFile = JSON.parse(
              fs.readFileSync(nodeRedFilePath, 'utf8')
            )
            const defaultPackageJSONFile = JSON.parse(
              fs.readFileSync(defaultPackageJSONFilePath, 'utf8')
            )

            Object.keys(packageJSONFile.dependencies).forEach(function(key) {
              delete nodeRedFile.nodes[key]
              delete defaultPackageJSONFile.dependencies[key]
            })
            fs.writeFileSync(nodeRedFilePath, JSON.stringify(nodeRedFile))
            fs.writeFileSync(
              defaultPackageJSONFilePath,
              JSON.stringify(defaultPackageJSONFile)
            )
          }

          if (
            Object.keys(flowPackage.packages).includes(
              '@uhuru/enebular-ai-contrib'
            )
          ) {
            delete flowPackage.packages['@uhuru/enebular-ai-contrib']
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
          fs.writeFile(packageJSONFilePath, packageJSON, (err) =>
            err ? resolve(new Error(err)) : resolve(null)
          )
        })
      )
    }
    let errorFlag = false
    await Promise.all(updates).then(function(error) {
      error.forEach(function(value) {
        if (value != null) {
          errorFlag = true
        }
      })
    })

    if (errorFlag === false) {
      try {
        let result = await this._resolveDependency(deployParam)
        if (result.success === true) {
          // rename downloaded new file
          await this.renameDownloadNewFile()
          return result
        } else {
          // Delete downloaded new file
          await this.deleteDownloadNewFile()
          return result
        }
      } catch (err) {
        // Delete downloaded new file
        await this.deleteDownloadNewFile()
        // for reason, cancel process is failed
        this._clearCancelRequest()
        return {
          success: false,
          message: err.message
        }
      }
    } else {
      // Delete downloaded new file
      await this.deleteDownloadNewFile()
      throw new Error(`Failed update flow package`)
    }
  }

  async renameDownloadNewFile() {
    let filePath
    filePath = path.join(this._getDataDir(), 'new-flows.json')
    if (this._isExistFile(filePath)) {
      fs.renameSync(filePath, path.join(this._getDataDir(), 'flows.json'))
    }
    filePath = path.join(this._getDataDir(), 'new-flows_cred.json')
    if (this._isExistFile(filePath)) {
      fs.renameSync(filePath, path.join(this._getDataDir(), 'flows_cred.json'))
    }
    filePath = path.resolve(
      this._getAiNodesDir(),
      'nodes',
      `new-enebular-ai-node.html`
    )
    if (this._isExistFile(filePath)) {
      fs.renameSync(
        filePath,
        path.resolve(this._getAiNodesDir(), 'nodes', `enebular-ai-node.html`)
      )
    }
    filePath = path.resolve(
      this._getAiNodesDir(),
      'nodes',
      `new-enebular-ai-node.js`
    )
    if (this._isExistFile(filePath)) {
      fs.renameSync(
        filePath,
        path.resolve(this._getAiNodesDir(), 'nodes', `enebular-ai-node.js`)
      )
    }
    filePath = path.join(
      this._getDataDir(),
      'node-red-enebular-ai-nodes',
      'new-package.json'
    )
    if (this._isExistFile(filePath)) {
      fs.renameSync(
        filePath,
        path.join(
          this._getDataDir(),
          'node-red-enebular-ai-nodes',
          'package.json'
        )
      )
    }
  }

  async deleteDownloadNewFile() {
    let filePath
    filePath = path.join(this._getDataDir(), 'new-flows.json')
    if (this._isExistFile(filePath)) {
      fs.unlinkSync(filePath)
    }
    filePath = path.join(this._getDataDir(), 'new-flows_cred.json')
    if (this._isExistFile(filePath)) {
      fs.unlinkSync(filePath)
    }
    filePath = path.resolve(
      this._getAiNodesDir(),
      'nodes',
      `new-enebular-ai-node.html`
    )
    if (this._isExistFile(filePath)) {
      fs.unlinkSync(filePath)
    }
    filePath = path.resolve(
      this._getAiNodesDir(),
      'nodes',
      `new-enebular-ai-node.js`
    )
    if (this._isExistFile(filePath)) {
      fs.unlinkSync(filePath)
    }
    filePath = path.join(
      this._getDataDir(),
      'node-red-enebular-ai-nodes',
      'new-package.json'
    )
    if (this._isExistFile(filePath)) {
      fs.unlinkSync(filePath)
    }
  }

  _isExistFile(path): boolean {
    try {
      fs.statSync(path)
      return true
    } catch (error) {
      return false
    }
  }

  _isExistCancelRequest(assetId: string, updateId: string): boolean {
    if (
      assetId === this._cancelRequest.assetId &&
      updateId === this._cancelRequest.updateId
    ) {
      return true
    }
    return false
  }

  async _restoreDirectory(baseDir: string, backupDir: string) {
    await fs.remove(baseDir)
    if (this._isExistFile(backupDir)) {
      await fs.copy(backupDir, baseDir)
    }
    await fs.remove(backupDir)
  }

  async _safeCopy(source: string, destination: string) {
    await execAsync(`find "${source}" -xtype l -delete 2>/dev/null`)
    await fs.move(source, destination)
  }

  async _resolveDependency(deployParam: Object): Promise<UpdatePackageResult> {
    try {
      let bsDir = path.join(this._getDataDir(), 'node_modules')
      let bkDir = path.join(this._getDataDir(), 'tmp')
      if (this._isExistFile(bsDir)) {
        await this._safeCopy(bsDir, bkDir)
      }
      let ret = await new Promise((resolve, reject) => {
        const cproc = spawn('npm', ['install', 'enebular-agent-dynamic-deps'], {
          stdio: 'inherit',
          cwd: this._getDataDir()
        })
        cproc.on('error', async (err) => {
          clearInterval(timer)
          await this._restoreDirectory(bsDir, bkDir)
          return reject(err)
        })
        cproc.once('exit', async (code, signal) => {
          clearInterval(timer)
          if (code !== null) {
            if (code === 0) {
              return resolve('success')
            } else {
              await this._restoreDirectory(bsDir, bkDir)
              return reject(
                new Error('Execution ended with failure exit code: ' + code)
              )
            }
          } else {
            resolve('cancel')
          }
        })
        const timer = setInterval(() => {
          if (
            this._isExistCancelRequest(
              deployParam.assetId,
              deployParam.updateId
            )
          ) {
            cproc.kill('SIGTERM')
            clearInterval(timer)
          }
        }, 100)
      })

      if (ret === 'cancel') {
        await this._restoreDirectory(bsDir, bkDir)
        return {
          success: false,
          message: 'deploy cancel'
        }
      }

      const srcPath = path.join(
        this._getDataDir(),
        'enebular-agent-dynamic-deps',
        'package.json'
      )
      const dstPath = path.join(this._getDataDir(), 'package.json')
      const src = JSON.parse(fs.readFileSync(srcPath, 'utf8'))
      const dst = JSON.parse(fs.readFileSync(dstPath, 'utf8'))

      Object.keys(src.dependencies).forEach(function(key) {
        dst.dependencies[key] = src.dependencies[key]
      })
      fs.writeFileSync(dstPath, JSON.stringify(dst))

      fs.removeSync(bkDir)

      return {
        success: true
      }
    } catch (err) {
      this._log.error(err)
      return {
        success: false,
        message: err.message
      }
    }
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

  _serviceIsRunning() {
    return this._cproc !== null
  }

  async startService(editSession: ?EditSession) {
    if (!this._isFlowEnabled()) {
      this.info('Skipped Node-RED start since flow is disabled')
      return
    }

    this._enableRequest()
    await this._processPendingFlowChanges()
  }

  async _startService(editSession: ?EditSession) {
    if (editSession) {
      this.info('Starting service (editor mode)...')
    } else {
      this.info('Starting service...')
    }

    let signaledSuccess = false
    return new Promise((resolve, reject) => {
      if (this._shutdownRequested) {
        const errorMsg = 'Start service failed since shutdown is requested.'
        reject(new Error(errorMsg))
        this._setFlowStatus('error', errorMsg)
        return
      }
      if (fs.existsSync(this._pidFile)) {
        ProcessUtil.killProcessByPIDFile(this._pidFile)
      }
      let [command, ...args] = this._command.split(/\s+/)
      let env = Object.assign(process.env, {
        ENEBULAR_ASSETS_DATA_PATH: this._assetsDataPath
      })
      if (this._flowState.envVariables) {
        for (const envVariable in this._flowState.envVariables) {
          env[envVariable] = this._flowState.envVariables[envVariable]
        }
      }
      if (this._flowState.envVariablesToRemote) {
        for (const envVariable of this._flowState.envVariablesToRemote) {
          delete env[envVariable]
        }
        this._flowState.envVariablesToRemote = null
      }
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
        if (editSession) {
          // リモートモード時はタイムアウトしても正常完了とする
          signaledSuccess = true
          clearTimeout(startTimeout)
          this._nodeRedLog.info('Pinging enebular editor...')
          this._sendEditorAgentIPAddress(editSession)
          this._setFlowStatus('running', null)
          resolve()
        } else {
          const errorMsg = 'Flow start timed out'
          reject(new Error(errorMsg))
          this._setFlowStatus('error', errorMsg)
        }
      }, this._flowStartTimeout)
      cproc.stdout.on('data', (data) => {
        let str = data.toString().replace(/(\n|\r)+$/, '')
        this._nodeRedLog.info(str)
        if (
          !signaledSuccess &&
          (str.includes('Started flows') ||
            str.includes('フローを開始しました'))
        ) {
          signaledSuccess = true
          clearTimeout(startTimeout)
          if (editSession) {
            this._nodeRedLog.info('Pinging enebular editor...')
            this._sendEditorAgentIPAddress(editSession)
          }
          this._setFlowStatus('running', null)
          resolve()
        }
      })
      cproc.stderr.on('data', (data) => {
        let str = data.toString().replace(/(\n|\r)+$/, '')
        this._nodeRedLog.error(str)
      })
      cproc.once('exit', (code, signal) => {
        const message =
          code !== null
            ? `Service exited, code ${code}`
            : `Service killed by signal ${signal}`
        this.info(message)
        this._cproc = null
        /* Restart automatically on an abnormal exit. */
        if (!this._shutdownRequested) {
          this._setFlowStatus('error', message)
          let shouldRetry = ProcessUtil.shouldRetryOnCrash(this._retryInfo)
          clearTimeout(startTimeout)
          if (shouldRetry) {
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
              `Unexpected exit, but retry count(${this._retryInfo.retryCount}) exceed max.`
            )
            reject(new Error('Too many retry to start Node-RED service'))
            /* Other restart strategies (change port, etc.) could be tried here. */
          }
        } else {
          this._setFlowStatus('stopped', null)
        }
        this._removePIDFile()
      })
      cproc.once('error', (err) => {
        this._cproc = null
        this._setFlowStatus('error', err.message)
        reject(err)
      })
      this._cproc = cproc
      if (this._cproc.pid) this._createPIDFile(this._cproc.pid.toString())
    })
  }

  async shutdownService() {
    this._shutdownRequested = true
    // clear all the previous actions, but wait for the last one if have
    this._actions = []
    return this._queueAction(async () => this._shutdownService())
  }

  async _shutdownService() {
    return new Promise((resolve, reject) => {
      const cproc = this._cproc
      if (cproc) {
        this.info('Shutting down service...')
        if (!this._shutdownRequested) {
          // could be an internal shutdown that haven't set the flag yet
          this._shutdownRequested = true
        }
        const shutdownTimer = setTimeout(() => {
          if (this._cproc) {
            this.info('Graceful shutdown timeout, killing service.')
            this._cproc.kill('SIGKILL')
          }
        }, 15 * 1000)
        cproc.once('exit', () => {
          this.info('Service ended')
          clearTimeout(shutdownTimer)
          this._shutdownRequested = false
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
