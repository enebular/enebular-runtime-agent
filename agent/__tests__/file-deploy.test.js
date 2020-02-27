
import AssetManager from '../src/asset-manager'
import DeviceStateManager from '../node_module/__mock__/device-state-manager'
import Config from '../src/config'
import AgentManagerMediator from '../src/agent-manager-mediator'
import EventEmitter from 'events'
import ConnectorMessenger from '../src/connector-messenger'
import ConnectorService from '../src/connector-service'
import LogManager from '../src/log-manager'

//jest.mock('fs');
jest.mock('device-state-manager');
jest.mock('child_process');

var path = require('path');
var _log = require('winston');
var _deviceStateManager = require('device-state-manager')

describe('listFilesInDirectorySync', () => {
  let _assetManager;
  let _connector;
  let _config;
  let _messageEmitter;
  let _agentMan;
  let _connectorMessenger;
  let _logManager;

  beforeEach(() => {
    _config = new Config(path.resolve(__dirname, '.'))
    _logManager = new LogManager(_config)
    _log = _logManager.addLogger('internal', [
      'console',
      'enebular',
      'file',
      'syslog'
    ])
    _messageEmitter = new EventEmitter()
    _agentMan = new AgentManagerMediator(_log)
    _connector = new ConnectorService()
    _connectorMessenger = new ConnectorMessenger(
      _connector,
      _log,
      _config.get('ENEBULAR_CONNECTOR_MESSENGER_REQ_RETYR_TIMEOUT')
    )
  });

  test('asset-manager test', async () => {
    _assetManager = new AssetManager(
      _deviceStateManager,
      _agentMan,
      _config,
      _log
    )

    await _assetManager.setup()

    _deviceStateManager._notifyStateChange('desired', 'assets')

    expect(2).toBe(2);
  });
});