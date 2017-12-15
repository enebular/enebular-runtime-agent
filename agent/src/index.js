/* @flow */
import fs from 'fs';
import path from 'path';
import os from 'os';
import EventEmitter from 'events';
import debug from 'debug';
import NodeREDController from './node-red-controller';
import DeviceAuthMediator from './device-auth-mediator';
import AgentManagerMediator from './agent-manager-mediator';
import LogManager from './log-manager'

/**
 *
 */
const log = debug('enebular-runtime-agent');
const logv = debug('enebular-runtime-agent:verbose');

/**
 *
 */
export type EnebularAgentConfig = {
  nodeRedDir: string,
  nodeRedCommand?: string,
  nodeRedKillSignal?: string,
  configFile?: string,
  enableConsoleLog? :boolean,
  enableFileLog? :boolean,
  logfilePath? :boolean,
  enableEnebularLog? :boolean,
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

  _authAttempting: boolean;
  _authRetryID: number;
  _authRetryTime: number = 0;

  _agentState: AgentState;

  _logManager: LogManager;
  _log: any;

  constructor(messengerSevice: MessengerService, config: EnebularAgentConfig) {
    const {
      nodeRedDir,
      nodeRedCommand = './node_modules/.bin/node-red -s .node-red-config/settings.js',
      nodeRedKillSignal = 'SIGINT',
      configFile = path.join(os.homedir(), '.enebular-config.json'),
    } = config;

    this._messengerSevice = messengerSevice;
    this._messengerSevice.on('connect', () => this._handleMessengerConnect());
    this._messengerSevice.on('disconnect', () => this._handleMessengerDisconnect());
    this._messengerSevice.on('message', (params) => this._handleMessengerMessage(params));

    this._agentMan = new AgentManagerMediator();

    let logConfig = {
      agentManager: this._agentMan,
    };
    logConfig['enableConsole'] = config.enableConsoleLog;
    logConfig['enableFile'] = config.enableFileLog;
    logConfig['filePath'] = config.logfilePath;
    logConfig['enableEnebular'] = config.enableEnebularLog;
    this._logManager = new LogManager(logConfig);
    this._log = this._logManager.addLogger('internal', ['console', 'enebular', 'file']);

    this._messageEmitter = new EventEmitter();
    this._nodeRed = new NodeREDController(
      nodeRedDir,
      nodeRedCommand,
      nodeRedKillSignal,
      this._messageEmitter,
      this._log,
      this._logManager
    );
    this._deviceAuth = new DeviceAuthMediator(this._messageEmitter);
    this._configFile = configFile;
    this._agentState = 'init';
  }

  get log(): any {
    return this._log;
  }

  get logManager(): any {
    return this._logManager;
  }

  async startup() {    
    this._loadAgentConfig();
    return this._nodeRed.startService();
  }

  async shutdown() {
    this._endDeviceAuthenticationAttempt();
    await this._nodeRed.shutdownService();
    await this._agentMan.cleanUp();
    this._logManager.shutdown();
  }

  _loadAgentConfig() {
    try {
      if (fs.existsSync(this._configFile)) {
        this._log.info('Reading config file:' + this._configFile);
        const data = fs.readFileSync(this._configFile, 'utf8');
        const { connectionId, deviceId, agentManagerBaseUrl, authRequestUrl } = JSON.parse(data);
        if (connectionId && deviceId && agentManagerBaseUrl && authRequestUrl) {
          this._registerAgentInfo({ connectionId, deviceId, agentManagerBaseUrl, authRequestUrl });
          this._changeAgentState('registered');
        } else {
          this._changeAgentState('unregistered');
        }
      } else {
        log('Creating config file:', this._configFile);
        fs.writeFileSync(this._configFile, '{}', 'utf8');
        this._changeAgentState('unregistered');
      }
    } catch (e) {
      console.error(e);
      this._changeAgentState('unregistered');
    }
  }

  _changeAgentState(nextState: AgentState) {
    log('Change agent state:', this._agentState, '=>', nextState);
    if (isPossibleStateTransition(this._agentState, nextState)) {
      this._agentState = nextState;
      try {
        this._handleChangeState();
      } catch (err) {
        console.error(err);
      }
    } else {
      console.warn(`Impossible state transition requested : ${this._agentState} => ${nextState}`);
    }
  }

  _registerAgentInfo({ connectionId, deviceId, authRequestUrl, agentManagerBaseUrl } : AgentSetting) {
    log('Config:')
    log('  connectionId:', connectionId)
    log('  deviceId:', deviceId)
    log('  authRequestUrl:', authRequestUrl)
    log('  agentManagerBaseUrl:', agentManagerBaseUrl)
    this._connectionId = connectionId;
    this._deviceId = deviceId;
    this._deviceAuth.setAuthRequestUrl(authRequestUrl);
    this._agentMan.setBaseUrl(agentManagerBaseUrl);
    const data = JSON.stringify({ connectionId, deviceId, authRequestUrl, agentManagerBaseUrl });
    fs.writeFileSync(this._configFile, data, 'utf8');
  }

  async _handleChangeState() {
    switch (this._agentState) {
      case 'registered':
        this._agentMan._agentState = 'registered'
        if (this._messengerSevice.connected) {
          this._startDeviceAuthenticationAttempt();
        }
        break;
      case 'unregistered':
        this._agentMan._agentState = 'unregistered'
        break;
      case 'authenticated':
        this._agentMan._agentState = 'authenticated'
        await this._startReporting();
        break;
    }
  }

  async _requestDeviceAuthentication() {
    log('Requsting authentication...');
    if (this._deviceAuth.requestingAuthenticate) {
      return;
    }
    const { _connectionId: connectionId, _deviceId: deviceId } = this;    
    if (!connectionId || !deviceId) {
      throw new Error('Connection ID and Device ID are not configured yet for the agent');
    }
    try {
      const { accessToken } = await this._deviceAuth.requestAuthenticate(connectionId, deviceId);
      this._agentMan.setAccessToken(accessToken);
      this._endDeviceAuthenticationAttempt();
      this._changeAgentState('authenticated');
    } catch (err) {
      log('Authentication failed:', err.message);
      if (this._agentState !== 'unauthenticated') {
        this._changeAgentState('unauthenticated');
      }
      if (this._authAttempting) {
        this._authRetryTime = (this._authRetryTime === 0) ? 15*1000 : this._authRetryTime * 2;
        this._authRetryTime = Math.min(this._authRetryTime, 4*60*60*1000);
        log(`Retrying authentication (in ${this._authRetryTime/1000}sec)...`);
        this._authRetryID = setTimeout(() => {
          this._requestDeviceAuthentication();
        }, this._authRetryTime);
      }
    }
  }

  _startDeviceAuthenticationAttempt() {
    log('Starting authentication...');
    /* if it's already active, just reset the retry time */
    this._authRetryTime = 0;
    if (!this._authAttempting) {
      this._requestDeviceAuthentication();
      this._authAttempting = true;
    }
  }

  _endDeviceAuthenticationAttempt() {
    if (this._authAttempting) {
      log('Ending authentication');
      if (this._authRetryID) {
        clearTimeout(this._authRetryID);
        this._authRetryID = undefined;
      }
      this._authRetryTime = 0;
      this._authAttempting = false;
    }
  }

  async _startReporting() {
    log('Starting reporting...');
    this._agentMan.startStatusReport();
    this._agentMan.startLogReport();
  }

  _handleMessengerConnect() {
    log('Messenger connected');
    if (this._agentState === 'registered' || this._agentState === 'unauthenticated') {
      this._startDeviceAuthenticationAttempt();
    }
  }

  async _handleMessengerDisconnect() {
    log('Messenger disconnected');
    this._endDeviceAuthenticationAttempt();
  }

  async _handleMessengerMessage(params: { messageType: string, message: any }) {
    log('Messenger message:', params.messageType);
    logv('Messenger message: content:', params.message);
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
