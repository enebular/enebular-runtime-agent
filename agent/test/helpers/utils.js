/* @flow */
import fs from 'fs'
import DummyServerConfig from './dummy-server-config'
import objectHash from 'object-hash'
import crypto from 'crypto'
import { version as agentVer } from '../../package.json'
import objectPath from 'object-path'

export default class Utils {
  static randomString() {
    return Math.random()
      .toString(36)
      .substr(2, 10)
  }

  static _createFile(name, data) {
    try {
      fs.writeFileSync(name, data, 'utf8')
    } catch (err) {
      console.log(err)
    }
    return name
  }

  static _createRandomEnebularConfigFile(data) {
    let configFileName =
      '/tmp/.enebular-config-' + Utils.randomString() + '.json'
    return Utils._createFile(configFileName, data)
  }

  static createDummyEnebularConfig(config, dummyServerPort) {
    let _port = dummyServerPort || 3001
    const _config = {
      connectionId: 'dummy_connectionId',
      deviceId: 'dummy_deviceId',
      authRequestUrl:
        'http://127.0.0.1:' + _port + DummyServerConfig.authenticationURL,
      agentManagerBaseUrl: 'http://127.0.0.1:' + _port + '/agent-manager'
    }

    const data = JSON.stringify(Object.assign(_config, config))
    return Utils._createRandomEnebularConfigFile(data)
  }

  static createBrokenEnebularConfig() {
    return Utils._createRandomEnebularConfigFile('{dsd,dsd,c[}')
  }

  static _createRandomEnebularActivationFile(data) {
    let configFileName =
      '/tmp/.enebular-activation-config-' + Utils.randomString() + '.json'
    return Utils._createFile(configFileName, data)
  }

  static createDummyEnebularActivationConfig(config, dummyServerPort) {
    let _port = dummyServerPort || 3001
    const _config = {
      enebularBaseURL: 'http://127.0.0.1:' + _port + '/enebular',
      licenseKey: '220dde76-e03f-4789-bc9f-c8e512faee27'
    }
    const data = JSON.stringify(Object.assign(_config, config))
    return Utils._createRandomEnebularActivationFile(data)
  }

  static createDummyEnebularActivationConfigInvalidKey(dummyServerPort) {
    return Utils.createDummyEnebularActivationConfig(
      { licenseKey: 'invalid_key' },
      dummyServerPort
    )
  }

  static createBrokenEnebularActivationConfig() {
    return Utils._createRandomEnebularActivationFile('{dsd,dsd,c[}')
  }

  static addNodeRedPortToConfig(config, nodeRedPort) {
    return Object.assign(
      { NODE_RED_COMMAND: './node_modules/.bin/node-red -p ' + nodeRedPort },
      config
    )
  }

  static createDefaultAgentConfig(nodeRedPort) {
    let agentConfig = {}
    agentConfig['NODE_RED_DIR'] = '../node-red'
    agentConfig['NODE_RED_DATA_DIR'] = '../node-red/.node-red-config'
    agentConfig['NODE_RED_COMMAND'] =
      './node_modules/.bin/node-red -p ' + nodeRedPort
    return agentConfig
  }

  static getMetaHash(state) {
    let hashObj = {
      fqDeviceId: state.fqDeviceId,
      type: state.type,
      state: state.state,
      meta: {
        v: state.meta.v,
        ts: state.meta.ts,
        uId: state.meta.uId,
        pHash: state.meta.pHash
      }
    }
    return objectHash(hashObj, { algorithm: 'sha1', encoding: 'base64' })
  }

  static getDummyState(type, state) {
    let newState = {
      fqDeviceId: 'dummy_connectionId::dummy_deviceId',
      type: type,
      meta: {
        pHash: '-',
        ts: Date.now(),
        v: 1,
        uId: 1
      },
      state: state
    }
    newState.meta.hash = Utils.getMetaHash(newState)
    return newState
  }

  static getDummyStatusState(type, v) {
    return Utils.getDummyState('status', {
      agent: {
        type: type,
        v: v
      }
    })
  }

  static getEmptyDeviceState() {
    return [
      {
        type: 'desired',
        state: {}
      },
      {
        type: 'reported',
        state: {}
      },
      Utils.getDummyStatusState('enebular-agent', agentVer)
    ]
  }

  static getFileIntegrity(path: string) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256')
      const file = fs.createReadStream(path)
      file.on('data', data => {
        hash.update(data)
      })
      file.on('end', () => {
        const digest = hash.digest('base64')
        resolve(digest)
      })
      file.on('error', err => {
        reject(err)
      })
    })
  }

  static createFileOfSize(fileName, size) {
    return new Promise((resolve, reject) => {
      let f = fs.openSync(fileName, 'w')
      for (let i = 0; i < size / 10; i++) fs.writeSync(f, Utils.randomString())
      fs.closeSync(f)
      resolve(true)
    })
  }

  static addFileAssetToState(state, assetId, fileName, integrity) {
    objectPath.set(state, 'state.assets.assets.' + assetId, {
      updateId: Utils.randomString(),
      ts: Date.now(),
      config: {
        name: fileName,
        type: 'file',
        destPath: 'dst',
        fileTypeConfig: {
          filename: fileName,
          integrity: integrity,
          internalSrcConfig: {
            key: fileName,
            stored: true
          }
        }
      }
    })
  }

  static addFileAssetToDesiredState(
    desiredState,
    assetId,
    fileName,
    integrity
  ) {
    Utils.addFileAssetToState(desiredState, assetId, fileName, integrity)
    return Utils.getDummyState('desired', desiredState.state)
  }

  static delDesiredAsset(desiredState, assetId) {
    objectPath.del(desiredState, 'state.assets.assets.' + assetId)
    return Utils.getDummyState('desired', desiredState.state)
  }

  static modifyDesiredAsset(desiredState, assetId, prop, value) {
    objectPath.set(
      desiredState,
      'state.assets.assets.' + assetId + '.' + prop,
      value
    )
    return Utils.getDummyState('desired', desiredState.state)
  }
}
