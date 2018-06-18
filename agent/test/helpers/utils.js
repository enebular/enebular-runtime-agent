import fs from 'fs'

export default class Utils {
  static randomString(method) {
    return Math.random().toString(36).substr(2, 10);
  }

  static getDummyEnebularConfig(config) {
    const _config = {
      connectionId: "dummy_connectionId",
      deviceId: "dummy_deviceId",
      authRequestUrl: "http://dummy.authRequestUrl",
      agentManagerBaseUrl: "http://dummy.agentManagerBaseUrl"
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
