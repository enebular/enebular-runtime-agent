import AssetManager from '../../src/asset-manager'
import DeviceCommandManager from '../../src/device-command-manager'
import DeviceStateManagerMock from './dummy-device-state-manager'
import ConnectorMessenger from '../../src/connector-messenger'
import Config from '../../src/config'
import AgentManagerMediatorMock from './dummy-agent-manager-mediator'
import EventEmitter from 'events'
import LogManager from '../../src/log-manager'

const path = require('path');

export default class DummyAgent {
    _config: Config
    _messageEmitter: EventEmitter
    _agentManagerMediator: AgentManagerMediator;
    _logManager: LogManager
    _log

    constructor(testPath) {
        this._config = new Config(path.resolve(testPath, '.'))
 //       this._config.set('ENEBULAR_LOG_LEVEL', 'debug')
 //       this._config.set('ENEBULAR_ENABLE_CONSOLE_LOG', true)
        this._logManager = new LogManager(this._config)
        this._log = this._logManager.addLogger('internal', [
          'console',
          'enebular',
          'file',
          'syslog'
        ])
        this._messageEmitter = new EventEmitter()
        this._agentManagerMediator = new AgentManagerMediatorMock(this._log)
        this._deviceStateManager = new DeviceStateManagerMock(null, this._messageEmitter, this._config, this._log)
        this._connectorMessenger = new ConnectorMessenger(/*this._connector*/ null, this._log, this._config.get('ENEBULAR_CONNECTOR_MESSENGER_REQ_RETYR_TIMEOUT'))
        this._deviceCommandManager = new DeviceCommandManager(this._connectorMessenger, this._messageEmitter, this._log)
        this._assetManager = new AssetManager(this._deviceStateManager, this._agentManagerMediator, this._config, this._log)

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
        return this._log;
    }

    async waitReported(timeout) {
        let cur = 0
        let deployResult = 'timeout'
        while(1) {
            let reported = this._deviceStateManager.getState('reported', 'assets')
            if (reported) {
                if(JSON.stringify(reported.assets) === '{}') {
                    if(this._deviceStateManager._reportedOp === 'remove') {
                        return this._deviceStateManager._reportedOp
                    }
                    break
                }
                for (const reportedAssetId in reported.assets) {
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
