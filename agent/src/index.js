/* @flow */
import fs from 'fs';
import path from 'path';
import os from 'os';
import EventEmitter from 'events';
import NodeREDController from './node-red-controller';
import DeviceAuthMediator from './device-auth-mediator';
import AgentManagerMediator from './agent-manager-mediator';

/**
 *
 */
export type EnebularAgentConfig = {
  nodeRedDir: string,
  nodeRedCommand?: string,
  configFile?: string,
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
      return nextState === 'authenticated';
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
      nodeRedCommand = 'npm start',
      configFile = path.join(os.homedir(), '.enebular-config.json'),
    } = config;
    this._messageEmitter = new EventEmitter();
    this._nodeRed = new NodeREDController(nodeRedDir, nodeRedCommand, this._messageEmitter);
    this._deviceAuth = new DeviceAuthMediator(this._messageEmitter);
    this._agentMan = new AgentManagerMediator();
    this._configFile = configFile;
    this._agentState = 'init';
  }

  async start() {
    this._loadAgentConfig();
    return this._messageEmitter.emit('start', {});
  }

  _loadAgentConfig() {
    try {
      const data = fs.readFileSync(this._configFile, 'utf8');
      const { connectionId, deviceId, agentManagerBaseUrl, authRequestUrl } = JSON.parse(data);
      if (connectionId && deviceId && agentManagerBaseUrl && authRequestUrl) {
        this._connectionId = deviceId;
        this._deviceId = deviceId;
        this._deviceAuth.setAuthRequestUrl(authRequestUrl);
        this._agentMan.setBaseUrl(agentManagerBaseUrl);
        this._changeAgentState('registered');
      }
    } catch (e) {
      console.error(e);
      this._changeAgentState('unregistered');
    }
  }

  _changeAgentState(nextState: AgentState) {
    if (isPossibleStateTransition(this._agentState, nextState)) {
      this._agentState = nextState;
      console.log(`*** agent state : ${this._agentState} ***`);
      try {
        this._handleChangeState();
      } catch (err) {
        console.error(err);
      }
    } else {
      console.warn(`Impossible state transition requested : ${this._agentState} => ${nextState}`);
    }
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
    const { _connectionId: connectionId, _deviceId: deviceId } = this;
    if (!connectionId || !deviceId) {
      throw new Error('Connection ID and Device ID are not configured yet for the agent');
    }
    try {
      const { accessToken } = await this._deviceAuth.requestAuthenticate(connectionId, deviceId);
      this._agentMan.setAccessToken(accessToken);
      this._changeAgentState('authenticated');
    } catch (err) {
      this._changeAgentState('unauthenticated');
      throw err;
    }
  }

  async _startStatusNotification() {
    this._agentMan.startStatusReport();
  }

  /**
   *
   */
  handleDeviceMasterMessage(messageType: string, message: any) {
    this._messageEmitter.emit(messageType, message);
  }
}
