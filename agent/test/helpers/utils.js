import fs from 'fs'
import DummyServerConfig from './dummy-server-config'

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
      { nodeRedCommand: './node_modules/.bin/node-red -p ' + nodeRedPort },
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
}
