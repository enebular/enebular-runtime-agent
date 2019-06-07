/* @flow */
import EventEmitter from 'events'
import fs from 'fs'
import type { Logger } from 'winston'
import { version as agentVer } from '../package.json'
import ConnectorService from './connector-service'
import ConnectorMessenger from './connector-messenger'
import EnebularActivator from './enebular-activator'
import DeviceAuthMediator from './device-auth-mediator'
import AgentManagerMediator from './agent-manager-mediator'
import DeviceStateManager from './device-state-manager'
import AgentInfoManager from './agent-info-manager'
import AssetManager from './asset-manager'
import CommandLine from './command-line'
import Config from './config'
import DockerManager from './docker-manager'
import LogManager from './log-manager'
import NodeREDController from './node-red-controller'
import PortManager from './port-manager'

export type EnebularAgentConfig = {
  NODE_RED_DIR: string,
  NODE_RED_DATA_DIR: string,
  NODE_RED_COMMAND?: string,
  NODE_RED_KILL_SIGNAL?: string,

  ENEBULAR_CONFIG_PATH?: string,

  ENEBULAR_LOG_LEVEL?: string,
  ENEBULAR_ENABLE_CONSOLE_LOG?: boolean,
  ENEBULAR_ENABLE_FILE_LOG?: boolean,
  ENEBULAR_ENABLE_SYSLOG?: boolean,
  ENEBULAR_LOG_FILE_PATH?: string,
  ENEBULAR_ENABLE_ENEBULAR_LOG?: boolean,
  ENEBULAR_ENEBULAR_LOG_CACHE_PATH?: string,
  ENEBULAR_ENEBULAR_LOG_MAX_CACHE_SIZE?: number,
  ENEBULAR_ENEBULAR_LOG_MAX_SIZE_PER_INTERVAL?: number,
  ENEBULAR_ENEBULAR_LOG_SEND_INTERVAL?: number,
  ENEBULAR_MONITOR_INTERVAL_FAST?: number,
  ENEBULAR_MONITOR_INTERVAL_FAST_PERIOD?: number,
  ENEBULAR_MONITOR_INTERVAL_NORMAL?: number
}

export type EnebularAgentOptions = {
  portBasePath: string,
  connector: ConnectorService,
  config: EnebularAgentConfig
}

type AgentSetting = {
  connectionId?: string,
  deviceId?: string,
  authRequestUrl?: string,
  agentManagerBaseUrl?: string
}

export type AgentState =
  | 'init'
  | 'registered'
  | 'unregistered'
  | 'authenticated'
  | 'unauthenticated'

function isPossibleStateTransition(state: AgentState, nextState: AgentState) {
  switch (state) {
    case 'init':
      return nextState === 'registered' || nextState === 'unregistered'
    case 'registered':
      return nextState === 'authenticated' || nextState === 'unauthenticated'
    case 'unregistered':
      return nextState === 'registered'
    case 'authenticated':
      return nextState === 'unauthenticated'
    case 'unauthenticated':
      return nextState === 'authenticated' || nextState === 'registered'
  }
}

export default class EnebularAgent extends EventEmitter {
  _connector: ConnectorService
  _connectorMessenger: ConnectorMessenger
  _activator: EnebularActivator
  _configFile: string
  _config: Config
  _commandLine: CommandLine
  _enebularAgentConfig: EnebularAgentConfig

  _messageEmitter: EventEmitter
  _nodeRed: NodeREDController
  _deviceAuth: DeviceAuthMediator
  _agentMan: AgentManagerMediator
  _deviceStateManager: DeviceStateManager
  _agentInfoManager: AgentInfoManager
  _assetManager: AssetManager
  _dockerManager: DockerManager

  _connectionId: ?string
  _deviceId: ?string
  _authRequestUrl: ?string
  _agentManagerBaseUrl: ?string

  _agentState: AgentState

  _logManager: LogManager
  _log: Logger

  _connectorRegisteringForActivation: boolean
  _monitoringEnabled: boolean = true
  _monitoringShutdown: boolean = false
  _monitoringActive: boolean = false
  _monitoringUpdateID: ?number
  _monitorIntervalFast: number
  _monitorIntervalFastPeriod: number
  _monitorIntervalNormal: number

  constructor(options: EnebularAgentOptions) {
    super()
    this._connector = options.connector
    this._enebularAgentConfig = options.config

    this._config = new Config(options.portBasePath)
    this._commandLine = new CommandLine(this._config)

    this._connector.on('activeChange', () => this._onConnectorActiveChange())
    this._connector.on('registrationChange', () => this._onConnectorRegChange())
    this._connector.on('connectionChange', () =>
      this._onConnectorConnectionChange()
    )
    this._connector.on('message', params => this._onConnectorMessage(params))
    this._connector.on('ctrlMessage', params =>
      this._onConnectorCtrlMessage(params)
    )
  }

  _init() {
    if (this._enebularAgentConfig) {
      const configKeys = Object.keys(this._enebularAgentConfig)
      configKeys.forEach(key => {
        this._config.set(key, this._enebularAgentConfig[key])
      })
    }

    const devMode = this._config.get('ENEBULAR_DEV_MODE')
    const nodeRedDir = this._config.get('NODE_RED_DIR')
    const nodeRedDataDir = this._config.get('NODE_RED_DATA_DIR')
    const nodeRedAiNodesDir = this._config.get('NODE_RED_AI_NODES_DIR')
    const defaultNodeRedCommand =
      './node_modules/.bin/node-red -s .node-red-config/settings.js'
    const nodeRedCommand =
      this._config.get('NODE_RED_COMMAND') || defaultNodeRedCommand
    const configFile = this._config.get('ENEBULAR_CONFIG_PATH')

    this._monitorIntervalFast = this._config.get(
      'ENEBULAR_MONITOR_INTERVAL_FAST'
    )
    this._monitorIntervalFastPeriod = this._config.get(
      'ENEBULAR_MONITOR_INTERVAL_FAST_PERIOD'
    )
    this._monitorIntervalNormal = this._config.get(
      'ENEBULAR_MONITOR_INTERVAL_NORMAL'
    )

    this._initLogging()

    this._log.info('enebular-agent version: ' + agentVer)
    if (devMode) {
      this._log.info('Running in Developer Mode')
    }
    this._log.info('Node-RED dir: ' + nodeRedDir)
    this._log.info('Node-RED data dir: ' + nodeRedDataDir)
    this._log.info('Node-RED command: ' + nodeRedCommand)
    this._log.info('Enebular config file: ' + configFile)

    this._connectorMessenger = new ConnectorMessenger(
      this._connector,
      this._log,
      this._config.get('ENEBULAR_CONNECTOR_MESSENGER_REQ_RETYR_TIMEOUT')
    )
    this._connectorMessenger.on('requestConnectorCtrlMessageSend', msg =>
      this._onRequestConnectorCtrlMessageSend(msg)
    )

    this._activator = new EnebularActivator(
      this._config.get('ACTIVATOR_CONFIG_PATH')
    )

    this._agentMan = new AgentManagerMediator(this._log)
    this._logManager.setEnebularAgentManager(this._agentMan)

    this._messageEmitter = new EventEmitter()

    this._deviceStateManager = new DeviceStateManager(
      this._connectorMessenger,
      this._messageEmitter,
      this._config,
      this._log
    )
    this._deviceStateManager.on('stateChange', params =>
      this._handleDeviceStateChange(params)
    )

    this._agentInfoManager = new AgentInfoManager(
      this._deviceStateManager,
      this._log
    )

    this._portManager = new PortManager(this._config, this._log)

    this._dockerManager = new DockerManager(
      this._deviceStateManager,
      this._agentMan,
      this._agentInfoManager,
      this._portManager,
      this._config,
      this._log
    )

    this._assetManager = new AssetManager(
      this._deviceStateManager,
      this._agentMan,
      this._config,
      this._log
    )

    this._nodeRed = new NodeREDController(
      this._deviceStateManager,
      this._connectorMessenger,
      this._messageEmitter,
      this._config,
      this._log,
      this._logManager,
      {
        dir: nodeRedDir,
        dataDir: nodeRedDataDir,
        aiNodesDir: nodeRedAiNodesDir,
        command: nodeRedCommand,
        killSignal: this._config.get('NODE_RED_KILL_SIGNAL'),
        pidFile: this._config.get('ENEBULAR_NODE_RED_PID_FILE'),
        assetsDataPath: this._config.get('ENEBULAR_ASSETS_DATA_PATH'),
        allowEditSessions: devMode
      }
    )

    this._deviceAuth = new DeviceAuthMediator(this._messageEmitter, this._log)
    this._deviceAuth.on('accessTokenUpdate', accessToken =>
      this._onAccessTokenUpdate(accessToken)
    )
    this._deviceAuth.on('accessTokenClear', () => this._onAccessTokenClear())

    this._configFile = configFile
    this._agentState = 'init'
  }

  _logMetrics() {
    const memUsage = process.memoryUsage()
    this._log.info('metrics.mem.rss: ' + memUsage.rss)
    this._log.info('metrics.mem.heapTotal: ' + memUsage.heapTotal)
    this._log.info('metrics.mem.heapUsed: ' + memUsage.heapUsed)
    this._log.info('metrics.mem.external: ' + memUsage.external)
  }

  _initLogging() {
    if (process.env.DEBUG) {
      this._config.set('ENEBULAR_LOG_LEVEL', process.env.DEBUG)
      this._config.set('ENEBULAR_ENABLE_CONSOLE_LOG', true)
    }
    this._logManager = new LogManager(this._config)
    this._log = this._logManager.addLogger('internal', [
      'console',
      'enebular',
      'file',
      'syslog'
    ])

    if (this._config.get('ENEBULAR_LOG_METRICS_ENABLE')) {
      const interval = this._config.get('ENEBULAR_LOG_METRICS_INTERVAL')
      setInterval(() => this._logMetrics(), interval * 1000)
    }
  }

  get log(): Logger {
    return this._log
  }

  get logManager(): LogManager {
    return this._logManager
  }

  get config(): Config {
    return this._config
  }

  get commandLine(): CommandLine {
    return this._commandLine
  }

  _requestConnectorRegister() {
    this.emit('connectorRegister')
  }

  _requestConnectorConnect(connect: boolean) {
    this.emit(connect ? 'connectorConnect' : 'connectorDisconnect')
  }

  _createPIDFile() {
    try {
      fs.writeFileSync(
        this._config.get('ENEBULAR_AGENT_PID_FILE'),
        process.pid.toString(),
        'utf8'
      )
    } catch (err) {
      this._log.error(err)
    }
  }

  _removePIDFile() {
    try {
      fs.unlinkSync(this._config.get('ENEBULAR_AGENT_PID_FILE'))
    } catch (err) {
      this._log.error(err)
    }
  }

  async startup() {
    if (this._connector.registerConfig) {
      await this._connector.registerConfig()
    }
    this._config.importEnvironmentVariables()
    this._commandLine.parse()
    this._config.importItems(this._commandLine.getConfigOptions())

    if (this._commandLine.hasCommand()) {
      // User input sub command, skip agent initialization.
      return this._commandLine.processCommand()
    }

    this._init()
    if (this._config.get('ENEBULAR_DAEMON_MODE')) {
      this._createPIDFile()
    }
    this._loadAgentConfig()

    await this._agentInfoManager.setup()
    await this._assetManager.setup()
    await this._dockerManager.setup()
    await this._portManager.setup()
    await this._nodeRed.setup()
    this._nodeRed.activate(true)

    this._updateMonitoringFromDesiredState()

    if (this._connector.init) {
      await this._connector.init()
    }

    try {
      await this._nodeRed.startService()
    } catch (err) {
      this._log.error('Node-RED service start failed: ' + err.message)
    }

    return true
  }

  async shutdown() {
    this._deviceAuth.endAuthAttempt()
    await this._nodeRed.shutdownService()
    this._nodeRed.activate(false)
    this._assetManager.activate(false)
    this._deviceStateManager.activate(false)
    this._dockerManager.activate(false)
    await this._logManager.shutdown()
    this._monitoringShutdown = true
    this._updateMonitoringActiveState()
    if (this._config.get('ENEBULAR_DAEMON_MODE')) {
      this._removePIDFile()
    }
  }

  async _handleDeviceStateChange(params: { type: string, path: ?string }) {
    if (params.path && !params.path.startsWith('monitoring')) {
      return
    }

    switch (params.type) {
      case 'desired':
        this._updateMonitoringFromDesiredState()
        break
      case 'reported':
        this._updateMonitoringReportedState()
        break
      default:
        break
    }
  }

  _updateMonitoringFromDesiredState() {
    const desiredState = this._deviceStateManager.getState(
      'desired',
      'monitoring'
    )

    if (desiredState && desiredState.hasOwnProperty('enable')) {
      this._monitoringEnabled = desiredState.enable
      this._updateMonitoringActiveState()
      this._updateMonitoringReportedState()
    }
  }

  _updateMonitoringReportedState() {
    if (!this._deviceStateManager.canUpdateState('reported')) {
      return
    }

    const reportedState = this._deviceStateManager.getState(
      'reported',
      'monitoring'
    )

    if (!reportedState || reportedState.enable !== this._monitoringEnabled) {
      this._deviceStateManager.updateState('reported', 'set', 'monitoring', {
        enable: this._monitoringEnabled
      })
    }
  }

  _updateMonitoringActiveState() {
    let shouldBeActive
    if (this._monitoringShutdown) {
      shouldBeActive = false
    } else {
      shouldBeActive =
        this._agentState === 'authenticated' && this._monitoringEnabled
    }

    if (shouldBeActive === this._monitoringActive) {
      return
    }

    this._monitoringActive = shouldBeActive

    if (this._monitoringActive) {
      this._log.info('Activating monitoring...')
      this._refreshMonitoringInterval()
    } else {
      this._log.info('Deactivating monitoring...')
    }

    this._logManager.activateEnebular(this._monitoringActive)
  }

  _refreshMonitoringInterval() {
    if (this._monitoringUpdateID) {
      clearTimeout(this._monitoringUpdateID)
      this._monitoringUpdateID = null
    }
    if (this._monitoringActive) {
      this._setMonitoringInterval(this._monitorIntervalFast)
      this._monitoringUpdateID = setTimeout(() => {
        this._setMonitoringInterval(this._monitorIntervalNormal)
      }, this._monitorIntervalFastPeriod * 1000)
    }
  }

  _setMonitoringInterval(interval: number) {
    this._log.debug(`Setting monitoring report interval to: ${interval}sec`)
    this._logManager.configureEnebular({
      sendInterval: interval
    })
  }

  _loadAgentConfig() {
    let registered = false
    try {
      if (fs.existsSync(this._configFile)) {
        this._log.info('Reading config file: ' + this._configFile)
        const data = fs.readFileSync(this._configFile, 'utf8')
        const {
          connectionId,
          deviceId,
          agentManagerBaseUrl,
          authRequestUrl
        } = JSON.parse(data)
        this._registerAgentInfo({
          connectionId,
          deviceId,
          agentManagerBaseUrl,
          authRequestUrl
        })
        registered = this._agentInfoIsComplete()
      }
    } catch (e) {
      this._log.error(e)
    }
    this._changeAgentState(registered ? 'registered' : 'unregistered')
  }

  _changeAgentState(nextState: AgentState) {
    if (isPossibleStateTransition(this._agentState, nextState)) {
      this._log.info('Agent state change:', this._agentState, '=>', nextState)
      this._agentState = nextState
      try {
        this._onChangeState()
      } catch (err) {
        this._log.error(err)
      }
    } else {
      this._log.error(
        `Impossible state transition requested: ${
          this._agentState
        } => ${nextState}`
      )
    }
  }

  _agentInfoIsComplete(): boolean {
    return (
      !!this._connectionId &&
      !!this._deviceId &&
      !!this._authRequestUrl &&
      !!this._agentManagerBaseUrl
    )
  }

  _saveAgentInfo() {
    const data = JSON.stringify({
      connectionId: this._connectionId,
      deviceId: this._deviceId,
      authRequestUrl: this._authRequestUrl,
      agentManagerBaseUrl: this._agentManagerBaseUrl
    })
    try {
      fs.writeFileSync(this._configFile, data, 'utf8')
    } catch (err) {
      this._log.error(err)
    }
  }

  _registerAgentInfo({
    connectionId,
    deviceId,
    authRequestUrl,
    agentManagerBaseUrl
  }: AgentSetting) {
    if (connectionId) {
      this._connectionId = connectionId
    }
    if (deviceId) {
      this._deviceId = deviceId
    }
    if (authRequestUrl) {
      this._authRequestUrl = authRequestUrl
    }
    if (agentManagerBaseUrl) {
      this._agentManagerBaseUrl = agentManagerBaseUrl
    }
    const formatVal = val => {
      return val || 'not set'
    }
    this._log.debug('Config:')
    this._log.debug('  connectionId: ' + formatVal(this._connectionId))
    this._log.debug('  deviceId: ' + formatVal(this._deviceId))
    this._log.debug('  authRequestUrl: ' + formatVal(this._authRequestUrl))
    this._log.debug(
      '  agentManagerBaseUrl: ' + formatVal(this._agentManagerBaseUrl)
    )
    if (!this._agentInfoIsComplete()) {
      return
    }
    this._deviceAuth.setAuthRequestParameters(
      this._authRequestUrl,
      this._connectionId,
      this._deviceId
    )
    this._agentMan.setBaseUrl(this._agentManagerBaseUrl)
    this._deviceStateManager.setFqDeviceId(
      `${this._connectionId}::${this._deviceId}`
    )
    if (this._connector.connected) {
      this._deviceStateManager.activate(true)
    }
  }

  async _onChangeState() {
    if (this._agentState !== 'authenticated') {
      this._updateMonitoringActiveState()
    }
    switch (this._agentState) {
      case 'registered':
        if (this._connector.connected) {
          this._deviceAuth.startAuthAttempt()
        }
        break
      case 'unregistered':
        break
      case 'authenticated':
        this._assetManager.activate(true)
        this._dockerManager.activate(true)
        setTimeout(() => {
          this._updateMonitoringActiveState()
        }, 10 * 1000)
        break
    }
  }

  _onAccessTokenUpdate(accessToken: string) {
    this._agentMan.setAccessToken(accessToken)
    if (this._agentState !== 'authenticated') {
      this._changeAgentState('authenticated')
    }
  }

  _onAccessTokenClear() {
    this._agentMan.setAccessToken('')
    if (this._agentState !== 'unauthenticated') {
      this._changeAgentState('unauthenticated')
    }
  }

  async _onConnectorActiveChange() {
    this._log.debug(
      `Connector: ${this._connector.active ? 'active' : 'inactive'}`
    )
    if (!this._connector.active) {
      return
    }
    if (this._agentInfoIsComplete()) {
      this._log.info('Registration info present. Connecting connector...')
      this._requestConnectorConnect(true)
      return
    }
    if (!this._activator || !this._activator.enabled()) {
      this._log.info(
        'No activation. Connecting connector to wait for registration...'
      )
      this._requestConnectorConnect(true)
      return
    }
    let result = await this._activator.canActivate()
    if (result.canActivate) {
      this._log.info('Starting registration via activation...')
      this._log.info('Requesting connector registration...')
      this._connectorRegisteringForActivation = true
      this._requestConnectorRegister()
    } else {
      this._log.info('Activator cannot activate: ' + result.message)
      this._log.info('Connector connection not possible')
    }
  }

  async _onConnectorRegChange() {
    this._log.debug(
      `Connector: ${this._connector.registered ? 'registered' : 'unregistered'}`
    )

    if (!this._connectorRegisteringForActivation) {
      /* Allow the deviceId to be updated anytime when not activating */
      if (this._connector.registered) {
        if (this._connector.deviceId !== this._deviceId) {
          this._registerAgentInfo({
            deviceId: this._connector.deviceId
          })
          this._saveAgentInfo()
          if (
            this._agentInfoIsComplete() &&
            this._agentState === 'unregistered'
          ) {
            this._changeAgentState('registered')
          }
        }
      }
      return
    }

    this._connectorRegisteringForActivation = false

    if (!this._connector.registered) {
      this._log.info("Activation halting as connector didn't register")
      return
    }

    try {
      this._log.info('Requesting activator activation...')
      let result = await this._activator.activate(this._connector.deviceId)
      this._registerAgentInfo({
        deviceId: this._connector.deviceId,
        connectionId: result.connectionId,
        authRequestUrl: result.authRequestUrl,
        agentManagerBaseUrl: result.agentManagerBaseUrl
      })
      this._log.info('Activator activation completed')
      if (this._agentInfoIsComplete()) {
        this._saveAgentInfo()
        this._changeAgentState('registered')
        this._requestConnectorConnect(true)
      } else {
        this._log.info('Agent info not complete after activation')
      }
    } catch (err) {
      this._log.error('Activation with activator failed: ' + err)
    }
  }

  _onConnectorConnectionChange() {
    this._log.debug(
      `Connector: ${this._connector.connected ? 'connected' : 'disconnected'}`
    )
    if (this._connector.connected) {
      this._deviceStateManager.activate(true)
      if (
        this._agentState === 'registered' ||
        this._agentState === 'unauthenticated'
      ) {
        this._deviceAuth.startAuthAttempt()
      }
    } else {
      this._deviceAuth.endAuthAttempt()
    }
  }

  async _onConnectorMessage(params: { messageType: string, message: any }) {
    this._log.debug('Connector: message:', params.messageType)
    this._log.debug(
      'Connector: message content: ' + JSON.stringify(params.message)
    )
    switch (params.messageType) {
      case 'register':
        if (
          this._agentState === 'init' ||
          this._agentState === 'unregistered' ||
          this._agentState === 'unauthenticated'
        ) {
          const {
            connectionId,
            deviceId,
            agentManagerBaseUrl,
            authRequestUrl
          } = params.message
          this._registerAgentInfo({
            connectionId,
            deviceId,
            agentManagerBaseUrl,
            authRequestUrl
          })
          if (this._agentInfoIsComplete()) {
            this._saveAgentInfo()
            this._changeAgentState('registered')
          }
        }
        break
      case 'deploy':
      case 'deviceStateChange':
        this._refreshMonitoringInterval()
        break
      default:
        break
    }
    this._messageEmitter.emit(params.messageType, params.message)
  }

  async _onConnectorCtrlMessage(message: any) {
    this._connectorMessenger.handleReceivedMessage(message)
  }

  _onRequestConnectorCtrlMessageSend(msg) {
    this.emit('connectorCtrlMessageSend', msg)
  }
}
