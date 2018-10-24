import fs from 'fs'
import DummyServerConfig from './dummy-server-config'
import objectHash from 'object-hash'

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

  static calcExpectedNumberOfRequestsByInterval(agent, runningTime) {
    const {
      _monitorIntervalFast,
      _monitorIntervalFastPeriod,
      _monitorIntervalNormal
    } = agent

    let requestsInFastPeriod = Math.floor(
      _monitorIntervalFastPeriod / _monitorIntervalFast
    )
    // the first request happen in zero second
    requestsInFastPeriod++
    if (runningTime <= _monitorIntervalFastPeriod) {
      return requestsInFastPeriod
    }

    let remain = runningTime - _monitorIntervalFastPeriod
    let requestsInNormalPeriod = Math.floor(remain / _monitorIntervalNormal)

    return requestsInFastPeriod + requestsInNormalPeriod
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

  static getDummyStatusState(type, v) {
    let new_state = {
      fqDeviceId: 'dummy_connectionId::dummy_deviceId',
      type: 'status',
      meta: {
        pHash: '-',
        ts: Date.now(),
        v: 1,
        uId: 1,
      },
      state: {
        agent: {
          type: type,
          v: v
        }
      }
    }
    new_state.meta.hash = Utils.getMetaHash(new_state)
    return new_state
  }
}
