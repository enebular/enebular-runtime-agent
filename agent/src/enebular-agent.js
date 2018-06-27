/* @flow */
import fs from 'fs'
import path from 'path'
import os from 'os'
import EventEmitter from 'events'
import ConnectorService from './connector-service'
import Activator from './activator'
import DeviceAuthMediator from './device-auth-mediator'
import AgentManagerMediator from './agent-manager-mediator'
import NodeREDController from './node-red-controller'
import LogManager from './log-manager'
import type { LogManagerConfig } from './log-manager'
import type { Logger } from 'winston'

export type EnebularAgentConfig = {
  nodeRedDir: string,
  nodeRedDataDir: string,
  nodeRedCommand?: string,
  nodeRedKillSignal?: string,

  configFile?: string,

  logLevel?: string,
  enableConsoleLog?: boolean,
  enableFileLog?: boolean,
  logfilePath?: string,
  enableEnebularLog?: boolean,
  enebularLogCachePath?: string,
  enebularLogMaxCacheSize?: number,
  monitorIntervalFast?: number,
  monitorIntervalFastPeriod?: number,
  monitorIntervalNormal?: number
}

type AgentSetting = {
  connectionId?: string,
  deviceId?: string,
  authRequestUrl?: string,
  agentManagerBaseUrl?: string
}

const MONITOR_INTERVAL_FAST = 30
const MONITOR_INTERVAL_NORMAL = 60 * 5
/* the +1 is to allow the last fast interval to trigger first */
const MONITOR_INTERVAL_FAST_PERIOD = 60 * 3 + 1

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
  _activator: Activator
  _configFile: string

  _messageEmitter: EventEmitter
  _nodeRed: NodeREDController
  _deviceAuth: DeviceAuthMediator
  _agentMan: AgentManagerMediator

  _connectionId: ?string
  _deviceId: ?string
  _authRequestUrl: ?string
  _agentManagerBaseUrl: ?string

  _agentState: AgentState

  _logManager: LogManager
  _log: Logger

  _connectorRegisteringForActivation: boolean
  _monitoringActivated: boolean = false
  _monitoringUpdateID: ?number
  _monitorIntervalFast: ?number
  _monitorIntervalFastPeriod: ?number
  _monitorIntervalNormal: ?number
  _notifyStatusActivated: boolean = false
  _notifyStatusInterval: number
  _notifyStatusIntervalID: ?number

  constructor(connector: ConnectorService, config: EnebularAgentConfig) {
    super()

    const {
      nodeRedDir,
      nodeRedDataDir,
      nodeRedCommand = './node_modules/.bin/node-red -s .node-red-config/settings.js',
      nodeRedKillSignal = 'SIGINT',
      configFile = path.join(os.homedir(), '.enebular-config.json'),
      monitorIntervalFast = MONITOR_INTERVAL_FAST,
      monitorIntervalFastPeriod = MONITOR_INTERVAL_FAST_PERIOD,
      monitorIntervalNormal = MONITOR_INTERVAL_NORMAL
    } = config

    this._monitorIntervalFast = monitorIntervalFast
    this._monitorIntervalFastPeriod = monitorIntervalFastPeriod
    this._monitorIntervalNormal = monitorIntervalNormal
    this._connector = connector
    connector.on('activeChange', () => this._onConnectorActiveChange())
    connector.on('registrationChange', () => this._onConnectorRegChange())
    connector.on('connectionChange', () => this._onConnectorConnectionChange())
    connector.on('message', params => this._onConnectorMessage(params))

    const activatorName = 'enebular'
    const activatorPath = path.join(__dirname, `${activatorName}-activator.js`)
    if (fs.existsSync(activatorPath)) {
      const Activator = require(activatorPath).default
      this._activator = new Activator()
    }

    this._initLogging(config)

    this._agentMan = new AgentManagerMediator(this._log)
    this._logManager.setEnebularAgentManager(this._agentMan)

    this._messageEmitter = new EventEmitter()

    this._nodeRed = new NodeREDController(
      this._messageEmitter,
      this._log,
      this._logManager,
      {
        dir: nodeRedDir,
        dataDir: nodeRedDataDir,
        command: nodeRedCommand,
        killSignal: nodeRedKillSignal
      }
    )

    this._deviceAuth = new DeviceAuthMediator(this._messageEmitter, this._log)
    this._deviceAuth.on('accessTokenUpdate', accessToken =>
      this._onAccessTokenUpdate(accessToken)
    )
    this._deviceAuth.on('accessTokenClear', () => this._onAccessTokenClear())

    this._configFile = configFile
    this._notifyStatusInterval = MONITOR_INTERVAL_NORMAL
    this._notifyStatusActivated = false
    this._agentState = 'init'
  }

  _initLogging(config: EnebularAgentConfig) {
    let logConfig: LogManagerConfig = {}
    logConfig['level'] = config.logLevel
    logConfig['enableConsole'] = config.enableConsoleLog
    logConfig['enableFile'] = config.enableFileLog
    logConfig['filePath'] = config.logfilePath
    logConfig['enableEnebular'] = config.enableEnebularLog
    logConfig['enebularCachePath'] = config.enebularLogCachePath
    logConfig['enebularMaxCacheSize'] = config.enebularLogMaxCacheSize
    logConfig['enebularMaxSizePerInterval'] =
      config.enebularLogMaxSizePerInterval
    logConfig['enebularSendInterval'] = config.enebularLogSendInterval

    if (process.env.DEBUG) {
      logConfig['level'] = process.env.DEBUG
      logConfig['enableConsole'] = true
    }
    this._logManager = new LogManager(logConfig)
    this._log = this._logManager.addLogger('internal', [
      'console',
      'enebular',
      'file'
    ])
  }

  get log(): Logger {
    return this._log
  }

  get logManager(): LogManager {
    return this._logManager
  }

  _requestConnectorRegister() {
    this.emit('connectorRegister')
  }

  _requestConnectorConnect(connect: boolean) {
    this.emit(connect ? 'connectorConnect' : 'connectorDisconnect')
  }

  async startup() {
    this._loadAgentConfig()
    return this._nodeRed.startService()
  }

  async shutdown() {
    this._deviceAuth.endAuthAttempt()
    if (this._monitoringActivated) {
      await this._agentMan.notifyStatus('disconnected')
    }
    await this._nodeRed.shutdownService()
    await this._logManager.shutdown()
    this._activateMonitoring(false)
  }

  _activateMonitoring(active: boolean) {
    if (active === this._monitoringActivated) {
      return
    }

    this._monitoringActivated = active

    if (active) {
      this._log.info('Activating monitoring...')
      this._refreshMonitoringInterval()
    } else {
      this._log.info('Deactivating monitoring...')
    }

    this._logManager.activateEnebular(active)
    this._activateStatusNotification(active)
  }

  _refreshMonitoringInterval() {
    if (this._monitoringUpdateID) {
      clearTimeout(this._monitoringUpdateID)
      this._monitoringUpdateID = null
    }
    if (this._monitoringActivated) {
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
    this._setStatusNotificationInterval(interval)
  }

  _updateStatusNotificationInterval() {
    if (this._notifyStatusIntervalID) {
      clearInterval(this._notifyStatusIntervalID)
      this._notifyStatusIntervalID = null
    }
    if (this._notifyStatusActivated) {
      this._agentMan.notifyStatus(this._nodeRed.getStatus())
      this._notifyStatusIntervalID = setInterval(() => {
        this._agentMan.notifyStatus(this._nodeRed.getStatus())
      }, this._notifyStatusInterval * 1000)
    }
  }

  _setStatusNotificationInterval(interval: number) {
    this._notifyStatusInterval = interval
    this._updateStatusNotificationInterval()
  }

  _activateStatusNotification(active: boolean) {
    this._notifyStatusActivated = active
    this._updateStatusNotificationInterval()
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
  }

  async _onChangeState() {
    if (this._agentState !== 'authenticated') {
      this._activateMonitoring(false)
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
        await this._activateMonitoring(true)
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
        this._refreshMonitoringInterval()
        break
      default:
        break
    }
    this._messageEmitter.emit(params.messageType, params.message)
  }
}
