/* @flow */
import fs from 'fs';
import path from 'path';
import os from 'os';
import EventEmitter from 'events';
import NodeREDController from './node-red-controller';
import DeviceAuthMediator from './device-auth-mediator';
import AgentManagerMediator from './agent-manager-mediator';
import LogManager from './log-manager';
import type {LogManagerConfig} from './log-manager';
import type {Logger} from 'winston';

/**
 *
 */
export type EnebularAgentConfig = {

  nodeRedDir: string,
  nodeRedCommand?: string,
  nodeRedKillSignal?: string,

  configFile?: string,

  logLevel?: string,
  enableConsoleLog? :boolean,
  enableFileLog? :boolean,
  logfilePath? :string,
  enableEnebularLog? :boolean,
  enebularLogCachePath? :string,
  enebularLogMaxCacheSize? :number,

};

type AgentSetting = {
  connectionId: string,
  deviceId: string,
  authRequestUrl: string,
  agentManagerBaseUrl: string,
};

export type AgentState =
  'init' |
  'registered' |
  'unregistered' |
  'authenticated' |
  'unauthenticated'
;

/**
 *
 */
function isPossibleStateTransition(state: AgentState, nextState: AgentState) {
  switch (state) {
    case 'init':
      return nextState === 'registered' || nextState === 'unregistered';
    case 'registered':
      return nextState === 'authenticated' || nextState === 'unauthenticated';
    case 'unregistered':
      return nextState === 'registered';
    case 'authenticated':
      return nextState === 'unauthenticated';
    case 'unauthenticated':
      return nextState === 'authenticated' || nextState === 'registered';
  }
}

/**
 *
 */
export class EnebularAgent {
  _configFile: string;

  _messengerSevice: MessengerService;

  _messageEmitter: EventEmitter;
  _nodeRed: NodeREDController;
  _deviceAuth: DeviceAuthMediator;
  _agentMan: AgentManagerMediator;

  _connectionId: ?string;
  _deviceId: ?string;

  _agentState: AgentState;

  _logManager: LogManager;
  _log: Logger;

  _monitoringActivated: boolean;
  _notifyStatusIntervalID: ?number;

  constructor(messengerSevice: MessengerService, config: EnebularAgentConfig) {
    const {
      nodeRedDir,
      nodeRedCommand    = './node_modules/.bin/node-red -s .node-red-config/settings.js',
      nodeRedKillSignal = 'SIGINT',
      configFile        = path.join(os.homedir(), '.enebular-config.json'),
    } = config;

    this._messengerSevice = messengerSevice;
    this._messengerSevice.on('connect', () => this._handleMessengerConnect());
    this._messengerSevice.on('disconnect', () => this._handleMessengerDisconnect());
    this._messengerSevice.on('message', (params) => this._handleMessengerMessage(params));

    this._initLogging(config);

    this._agentMan = new AgentManagerMediator(this._log);
    this._logManager.setEnebularAgentManager(this._agentMan);

    this._messageEmitter = new EventEmitter();

    this._nodeRed = new NodeREDController(
      this._messageEmitter,
      this._log,
      this._logManager,
      {
        dir: nodeRedDir,
        command: nodeRedCommand,
        killSignal: nodeRedKillSignal,
      }
    );

    this._deviceAuth = new DeviceAuthMediator(this._messageEmitter, this._log);
    this._deviceAuth.on('accessTokenUpdate', (accessToken) => this._handleAccessTokenUpdate(accessToken));
    this._deviceAuth.on('accessTokenClear', () => this._handleAccessTokenClear());

    this._configFile = configFile;
    this._agentState = 'init';
  }

  _initLogging(config: EnebularAgentConfig) {
    let logConfig: LogManagerConfig   = {};
    logConfig['level']                = config.logLevel;
    logConfig['enableConsole']        = config.enableConsoleLog;
    logConfig['enableFile']           = config.enableFileLog;
    logConfig['filePath']             = config.logfilePath;
    logConfig['enableEnebular']       = config.enableEnebularLog;
    logConfig['enebularCachePath']    = config.enebularLogCachePath;
    logConfig['enebularMaxCacheSize'] = config.enebularLogMaxCacheSize;
    if (process.env.DEBUG) {
      logConfig['level']              = process.env.DEBUG;
      logConfig['enableConsole']      = true;
    }
    this._logManager = new LogManager(logConfig);
    this._log = this._logManager.addLogger('internal', ['console', 'enebular', 'file']);
  }

  get log(): Logger {
    return this._log;
  }

  get logManager(): LogManager {
    return this._logManager;
  }

  async startup() {
    this._loadAgentConfig();
    return this._nodeRed.startService();
  }

  async shutdown() {
    this._deviceAuth.endAuthAttempt();
    if (this._monitoringActivated) {
      await this._agentMan.notifyStatus('disconnected');
    }
    await this._nodeRed.shutdownService();
    await this._logManager.shutdown();
    this._activateMonitoring(false);
  }

  _activateMonitoring(active: boolean) {
    if (this._monitoringActivated === active) {
      return;
    }
    this._monitoringActivated = active;
    this._logManager.activateEnebular(active);
    this._activateStatusNotification(active);
  }

  _activateStatusNotification(active: boolean) {
    if (this._notifyStatusIntervalID) {
      clearInterval(this._notifyStatusIntervalID);
      this._notifyStatusIntervalID = null;
    }
    if (active) {
      this._agentMan.notifyStatus(this._nodeRed.getStatus());
      this._notifyStatusIntervalID = setInterval(() => {
        this._agentMan.notifyStatus(this._nodeRed.getStatus());
      }, 30000);
    }
  }

  _startMonitoring() {
    this._log.info('Starting monitoring...');
    this._logManager.configureEnebular({
      sendInterval: 30,
      sendSize: 100 * 1024,
    });
    this._activateMonitoring(true);
  }

  _loadAgentConfig() {
    try {
      if (fs.existsSync(this._configFile)) {
        this._log.info('Reading config file: ' + this._configFile);
        const data = fs.readFileSync(this._configFile, 'utf8');
        const { connectionId, deviceId, agentManagerBaseUrl, authRequestUrl } = JSON.parse(data);
        if (connectionId && deviceId && agentManagerBaseUrl && authRequestUrl) {
          this._registerAgentInfo({ connectionId, deviceId, agentManagerBaseUrl, authRequestUrl });
          this._changeAgentState('registered');
        } else {
          this._changeAgentState('unregistered');
        }
      } else {
        this._log.debug('Creating config file:', this._configFile);
        fs.writeFileSync(this._configFile, '{}', 'utf8');
        this._changeAgentState('unregistered');
      }
    } catch (e) {
      this._log.error(e);
      this._changeAgentState('unregistered');
    }
  }

  _changeAgentState(nextState: AgentState) {
    if (isPossibleStateTransition(this._agentState, nextState)) {
      this._log.info('Agent state change:', this._agentState, '=>', nextState);
      this._agentState = nextState;
      try {
        this._handleChangeState();
      } catch (err) {
        this._log.error(err);
      }
    } else {
      this._log.error(`Impossible state transition requested : ${this._agentState} => ${nextState}`);
    }
  }

  _registerAgentInfo({ connectionId, deviceId, authRequestUrl, agentManagerBaseUrl } : AgentSetting) {
    this._log.debug('Config:')
    this._log.debug('  connectionId:', connectionId)
    this._log.debug('  deviceId:', deviceId)
    this._log.debug('  authRequestUrl:', authRequestUrl)
    this._log.debug('  agentManagerBaseUrl:', agentManagerBaseUrl)
    this._connectionId = connectionId;
    this._deviceId = deviceId;
    this._deviceAuth.setAuthRequestParameters(
      authRequestUrl,
      connectionId,
      deviceId
    );
    this._agentMan.setBaseUrl(agentManagerBaseUrl);
    const data = JSON.stringify({ connectionId, deviceId, authRequestUrl, agentManagerBaseUrl });
    fs.writeFileSync(this._configFile, data, 'utf8');
  }

  async _handleChangeState() {
    if (this._agentState !== 'authenticated') {
      this._activateMonitoring(false);
    }
    switch (this._agentState) {
      case 'registered':
        if (this._messengerSevice.connected) {
          this._deviceAuth.startAuthAttempt();
        }
        break;
      case 'unregistered':
        break;
      case 'authenticated':
        await this._startMonitoring();
        break;
    }
  }

  _handleAccessTokenUpdate(accessToken: string) {
    this._agentMan.setAccessToken(accessToken);
    if (this._agentState !== 'authenticated') {
      this._changeAgentState('authenticated');
    }
  }

  _handleAccessTokenClear() {
    this._agentMan.setAccessToken('');
    if (this._agentState !== 'unauthenticated') {
      this._changeAgentState('unauthenticated');
    }
  }

  _handleMessengerConnect() {
    this._log.debug('Messenger connected');
    if (this._agentState === 'registered' || this._agentState === 'unauthenticated') {
      this._deviceAuth.startAuthAttempt();
    }
  }

  async _handleMessengerDisconnect() {
    this._log.debug('Messenger disconnected');
    this._deviceAuth.endAuthAttempt();
  }

  async _handleMessengerMessage(params: { messageType: string, message: any }) {
    this._log.debug('Messenger message:', params.messageType);
    this._log.debug('Messenger message: content: ' + JSON.stringify(params.message));
    switch (params.messageType) {
      case 'register':
        if (this._agentState === 'init' || this._agentState === 'unregistered' || this._agentState === 'unauthenticated') {
          const { connectionId, deviceId, agentManagerBaseUrl, authRequestUrl } = params.message;
          this._registerAgentInfo({ connectionId, deviceId, agentManagerBaseUrl, authRequestUrl });
          this._changeAgentState('registered');
        }
        break;
      default:
        break;
    }
    this._messageEmitter.emit(params.messageType, params.message);
  }
}

export class MessengerService extends EventEmitter {

  _connected: boolean = false;

  constructor() {
    super();
  }

  get connected(): boolean {
    return this._connected;
  }

  updateConnectedState(connected: boolean) {
    if (connected === this._connected) {
      return;
    }
    this._connected = connected;
    this.emit(this._connected ? 'connect' : 'disconnect');
  }

  sendMessage(messageType: string, message: any) {
    this.emit('message', {messageType: messageType, message: message});
  }

}
