import AssetManager from '../../src/asset-manager'
import DeviceStateManagerMock from './dummy-device-state-manager'
import Config from '../../src/config'
import AgentManagerMediatorMock from './dummy-agent-manager-mediator'
import EventEmitter from 'events'
import {
    isEmpty
} from './utils'

const path = require('path');
const log = require('winston')

export default class DummyAgent {
    _config: Config
    _messageEmitter:EventEmitter
    _agentManagerMediator:AgentManagerMediator;

    constructor(testPath) {
        this._config = new Config(path.resolve(testPath, '.'))
        this._messageEmitter = new EventEmitter()
        this._agentManagerMediator = new AgentManagerMediatorMock(log)
        this._deviceStateManager = new DeviceStateManagerMock(null, this._messageEmitter, this._config, log)
        this._assetManager = new AssetManager(this._deviceStateManager, this._agentManagerMediator, this._config, log)
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

    async waitReported(timeout) {
        let cur = 0
        let deployResult = 'timeout'
        while(1) {
            let reported = this._deviceStateManager.getState('reported', 'assets')
            if (reported) {
                let reportedAssets = reported.assets || {}
                if(JSON.stringify(reportedAssets.assets) === '{}') {
                    if(this._deviceStateManager._reportedOp === 'remove') {
                        return this._deviceStateManager._reportedOp
                    }
                    break
                }
                for (const reportedAssetId in reportedAssets.assets) {
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
