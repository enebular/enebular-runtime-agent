import fs from 'fs'

export default class Utils {
  static randomString(method) {
    return Math.random().toString(36).substr(2, 10);
  }

  static getDummyEnebularConfig(config, port) {
    let _port = port || 3001
    const _config = {
      connectionId: "dummy_connectionId",
      deviceId: "dummy_deviceId",
      authRequestUrl: "http://127.0.0.1:" + _port + "/api/v1/token/device",
      agentManagerBaseUrl: "http://127.0.0.1:" + _port + "/api/v1"
    } 

    const data = JSON.stringify(Object.assign(_config, config))
    let configFileName = '/tmp/.enebular-config-' + Utils.randomString() + '.json';
    try {
      fs.writeFileSync(configFileName, data, 'utf8')
    } catch (err) {
      console.log(err)
    }
    return configFileName
  }

  static getBrokenEnebularConfig() {
    let configFileName = '/tmp/.enebular-config-' + Utils.randomString() + '.json';
    try {
      fs.writeFileSync(configFileName, "{dsd,dsd,c[}", 'utf8')
    } catch (err) {
      console.log(err)
    }
    return configFileName
  }

}
