import AssetManager from '../../src/asset-manager'
import DeviceStateManagerMock from '../mocks/device-state-manager-mock'
import Config from '../../src/config'
import AgentManagerMediatorMock from '../mocks/agent-manager-mediator-mock'
import EventEmitter from 'events'

const path = require('path');
const log = require('winston')

export default class DummyAgent {
    _config: Config
    _messageEmitter:EventEmitter
    _agentMan:AgentManagerMediator;

    constructor() {
        this._config = new Config(path.resolve(__dirname, '../'))
        this._messageEmitter = new EventEmitter()
        this._agentMan = new AgentManagerMediatorMock(log)
        this._deviceStateManager = new DeviceStateManagerMock(null, this._messageEmitter, this._config, log)
        this._assetManager = new AssetManager(this._deviceStateManager, this._agentMan, this._config, log)
    }

    assetManager() {
        return this._assetManager;
    }

    deviceStateManager() {
        return this._deviceStateManager;
    }

    sleep(waitSeconds) {
        return new Promise(resolve => {
          setTimeout(() => {
            resolve()
          }, waitSeconds * 1000)
        }) 
    }
}

export function desired(ptn) {
    let desiredObj = {}
    switch (ptn) {
        case 0: // File Deploy normal
            desiredObj = {
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
        default:
            break;
    }
    return desiredObj;
}
