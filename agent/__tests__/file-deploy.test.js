
import AssetManager from '../src/asset-manager'
import DeviceStateManagerMock from './mocks/device-state-manager-mock'
import Config from '../src/config'
import AgentManagerMediatorMock from './mocks/agent-manager-mediator-mock'
import EventEmitter from 'events'
import ConnectorMessenger from '../src/connector-messenger'
import ConnectorService from '../src/connector-service'
import LogManager from '../src/log-manager'
import * as utils from '../src/utils'

jest.unmock('child_process');
jest.unmock('fs');

const path = require('path');
const fs = require('fs')

describe('File Deploy Test', () => {
  let _assetManager;
  let _connector;
  let _config;
  let _messageEmitter;
  let _agentMan;
  let _connectorMessenger;
  let _logManager;
  let _log;
  let _deviceStateManager;
  let utilSpy

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
    _agentMan = new AgentManagerMediatorMock(_log)
    _connector = new ConnectorService()
    _connectorMessenger = new ConnectorMessenger(
      _connector,
      _log,
      _config.get('ENEBULAR_CONNECTOR_MESSENGER_REQ_RETYR_TIMEOUT')
    )
    _deviceStateManager = new DeviceStateManagerMock(
      _connectorMessenger,
      _messageEmitter,
      _config,
      _log
    )

    utilSpy = jest.spyOn(
      utils,
      'progressRequest'
    ).mockImplementation((url, path, obj) => {
      fs.writeFileSync(
        path,
        'test',
        'utf8'
      )
    });
  });

  afterEach(() => {
    utilSpy.mockRestore();
  });

  test('normal test', async () => {

    _assetManager = new AssetManager(
      _deviceStateManager,
      _agentMan,
      _config,
      _log
    )

    await _assetManager.setup()
    _assetManager.activate(true)

    let desiredObj = {
        assets: {
          "5b6aef66-909e-4ae8-8174-ab140c372935" : {
            "updateId": "d8b121b9-dd3e-4deb-9df5-b052891f6cc5",
            "ts": 1582791873608,
            "config": {
              "name": "file-test-hara2",
              "type": "file",
              "fileTypeConfig": {
                "src": "internal",
                "internalSrcConfig": {
                  "stored": true,
                  "key": "8fd1e77a-b8d1-4c5b-b084-ede655daabd0"
                },
                "filename": "test_hara2.txt.txt",
                "integrity": "n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg=",
                "size": 4
              },
              "destPath": "test_hara"
            }
          }
        }
    }
    _deviceStateManager.__setState('desired', desiredObj)

    _deviceStateManager._notifyStateChange('desired', 'assets')

    await sleep(2)
    expect(2).toBe(2);
  });
});

async function sleep(waitSeconds) {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve()
    }, waitSeconds * 1000)
  }) 
}