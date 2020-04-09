import AssetManager from '../../src/asset-manager'
import DeviceCommandManager from '../../src/device-command-manager'
import DeviceStateManagerMock from './dummy-device-state-manager'
import ConnectorMessenger from '../../src/connector-messenger'
import Config from '../../src/config'
import AgentManagerMediatorMock from './dummy-agent-manager-mediator'
import EventEmitter from 'events'
import LogManager from '../../src/log-manager'
import {
    isEmpty
} from './utils'

const path = require('path');
const log = require('winston')

export default class DummyAgent {
    _config: Config
    _messageEmitter: EventEmitter
    _agentManagerMediator: AgentManagerMediator;
    _logManager: LogManager

    constructor(testPath) {
        this._config = new Config(path.resolve(testPath, '.'))
        this._messageEmitter = new EventEmitter()
        this._agentManagerMediator = new AgentManagerMediatorMock(log)
        this._deviceStateManager = new DeviceStateManagerMock(null, this._messageEmitter, this._config, log)
        this._connectorMessenger = new ConnectorMessenger(/*this._connector*/ null, log, this._config.get('ENEBULAR_CONNECTOR_MESSENGER_REQ_RETYR_TIMEOUT'))
        this._deviceCommandManager = new DeviceCommandManager(this._connectorMessenger, this._messageEmitter, log)
        this._logManager = new LogManager(this._config)
        this._assetManager = new AssetManager(this._deviceStateManager, this._agentManagerMediator, this._config, log)


        this._deviceStateManager.__setState("desired", null, {type: "desired", meta: {}, state: {}})
        this._deviceStateManager.__setState("reported", null, {type: "reported", meta: {}, state: {assets: {}}})
        this._deviceStateManager.__setState("state", null, {type: "state", meta: {}, state: {}})
    }

    assetManager() {
        return this._assetManager;
    }

    deviceStateManager() {
        return this._deviceStateManager;
    }
    
    AgentManagerMediator() {
        return this._agentManagerMediator;
    }

    connectorMessenger() {
        return this._connectorMessenger;
    }

    deviceCommandManager() {
        return this._deviceCommandManager;
    }

    config() {
        return this._config;
    }

    logManager() {
        return this._logManager;
    }

    log() {
        return log;
    }

    async waitReported(timeout) {
        let cur = 0
        let deployResult = 'timeout'
        while(1) {
            let reported = this._deviceStateManager.getState('reported', 'assets')
            if (reported) {
                if(JSON.stringify(reported.assets) === '{}') {
//                if(JSON.stringify(reported) === '{}') {
                    if(this._deviceStateManager._reportedOp === 'remove') {
                        return this._deviceStateManager._reportedOp
                    }
                    break
                }
                for (const reportedAssetId in reported.assets) {
                //for (const reportedAssetId in reported) {
                    let found = false
                    for (let asset of this._assetManager._assets) {
                      if (asset.id() === reportedAssetId) {
                        if( asset.state === 'deployed' ||
                            asset.state === 'deployFail' ||
                            asset.state === 'removeFail' ) {
                            return asset.state
                        }
                        break
                      }
                    }
                }
            }

            if(cur == timeout)  {
                break
            }
            cur++

            await this.sleep(1)
        }

        return deployResult
    }

    sleep(waitms) {
        return new Promise(resolve => {
          setTimeout(() => {
            resolve()
          }, waitms)
        }) 
    }
}
