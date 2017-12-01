/* @flow */
import fs from 'fs';
import path from 'path';
import os from 'os';
import EventEmitter from 'events';
import debug from 'debug';
import NodeREDController from './node-red-controller';
import DeviceAuthMediator from './device-auth-mediator';
import AgentManagerMediator from './agent-manager-mediator';

/**
 *
 */
const log = debug('enebular-runtime-agent');

/**
 *
 */
export type EnebularAgentConfig = {
  nodeRedDir: string,
  nodeRedCommand?: string,
  nodeRedKillSignal?: string,
  configFile?: string,
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
export default class EnebularAgent {
  _configFile: string;

  _messageEmitter: EventEmitter;
  _nodeRed: NodeREDController;
  _deviceAuth: DeviceAuthMediator;
  _agentMan: AgentManagerMediator;

  _connectionId: ?string;
  _deviceId: ?string;

  _agentState: AgentState;

  constructor(config: EnebularAgentConfig) {
    const {
      nodeRedDir,
      nodeRedCommand = './node_modules/.bin/node-red -s .node-red-config/settings.js',
      nodeRedKillSignal = 'SIGINT',
      configFile = path.join(os.homedir(), '.enebular-config.json'),
    } = config;
    this._messageEmitter = new EventEmitter();
    this._nodeRed = new NodeREDController(nodeRedDir, nodeRedCommand, nodeRedKillSignal, this._messageEmitter);
    this._deviceAuth = new DeviceAuthMediator(this._messageEmitter);
    this._agentMan = new AgentManagerMediator(this._nodeRed);
    this._configFile = configFile;
    this._agentState = 'init';
  }

  async startup() {    
    this._loadAgentConfig();
    return this._nodeRed.startService();
  }

  async shutdown() {
    return this._nodeRed.shutdownService();
  }

  _loadAgentConfig() {
    log('_loadAgentConfig');
    try {
      if (fs.existsSync(this._configFile)) {
        log('reading config file', this._configFile);
        const data = fs.readFileSync(this._configFile, 'utf8');
        const { connectionId, deviceId, agentManagerBaseUrl, authRequestUrl } = JSON.parse(data);
        if (connectionId && deviceId && agentManagerBaseUrl && authRequestUrl) {
          this._registerAgentInfo({ connectionId, deviceId, agentManagerBaseUrl, authRequestUrl });
          this._changeAgentState('registered');
        } else {
          this._changeAgentState('unregistered');
        }
      } else {
        log('creating new config file ', this._configFile);
        fs.writeFileSync(this._configFile, '{}', 'utf8');
        this._changeAgentState('unregistered');
      }
    } catch (e) {
      console.error(e);
      this._changeAgentState('unregistered');
    }
  }

  _changeAgentState(nextState: AgentState) {
    log('_changeAgentState', this._agentState, '=>', nextState);
    if (isPossibleStateTransition(this._agentState, nextState)) {
      this._agentState = nextState;
      log(`*** agent state : ${this._agentState} ***`);
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
    log('connectionId', connectionId)
    log('deviceId', deviceId)
    log('authRequestUrl', authRequestUrl)
    log('agentManagerBaseUrl', agentManagerBaseUrl)
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
        await this._requestDeviceAuthentication();
        break;
      case 'unregistered':
        break;
      case 'authenticated':
        await this._startStatusNotification();
        break;
    }
  }

  async _requestDeviceAuthentication() {
    log('_requestDeviceAuthentication');
    const { _connectionId: connectionId, _deviceId: deviceId } = this;    
    if (!connectionId || !deviceId) {
      throw new Error('Connection ID and Device ID are not configured yet for the agent');
    }
    try {
      const { accessToken } = await this._deviceAuth.requestAuthenticate(connectionId, deviceId);
      this._agentMan.setAccessToken(accessToken);
      this._changeAgentState('authenticated');
    } catch (err) {
      log('err---', err)
      this._changeAgentState('unauthenticated');
      throw err;
    }
  }

  async _startStatusNotification() {
    log('_startStatusNotification');
    this._agentMan.startStatusReport();
    this._startRecordLogs()
  }

  async _startRecordLogs() {
    this._agentMan.startLogReport()
  }

  /**
   *
   */
  handleDeviceMasterMessage(messageType: string, message: any) {
    log('handleDeviceMasterMessage', messageType, message);
    switch (messageType) {
      case 'register':
        if (this._agentState === 'init' || this._agentState === 'unregistered' || this._agentState === 'unauthenticated') {
          const { connectionId, deviceId, agentManagerBaseUrl, authRequestUrl } = message;
          this._registerAgentInfo({ connectionId, deviceId, agentManagerBaseUrl, authRequestUrl });
          this._changeAgentState('registered');
        }
        break;
      default:
        break;
    }
    this._messageEmitter.emit(messageType, message);
  }
}
