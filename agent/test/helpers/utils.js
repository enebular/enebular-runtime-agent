import fs from 'fs'
import path from 'path'

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

  static getDummyEnebularActivationConfig(config, port) {
    let _port = port || 3001
    const _config = {
      enebularBaseURL: "http://127.0.0.1:" + _port + "/api/v1",
      licenseKey: "220dde76-e03f-4789-bc9f-c8e512faee27"
    } 
    const data = JSON.stringify(Object.assign(_config, config))
    let configFileName = '/tmp/.enebular-activation-config-' + Utils.randomString() + '.json';
    try {
      fs.writeFileSync(configFileName, data, 'utf8')
    } catch (err) {
      console.log(err)
    }
    return configFileName
  }

  static getDummyEnebularActivationConfigInvalidKey(port) {
    return Utils.getDummyEnebularActivationConfig({licenseKey: 'invalid_key'}, port)
  }

  static getBrokenActivationConfig() {
    let configFileName = '/tmp/.enebular-activation-config-' + Utils.randomString() + '.json';
    try {
      fs.writeFileSync(configFileName, "{dsd,dsd,c[}", 'utf8')
    } catch (err) {
      console.log(err)
    }
    return configFileName
  }

  static addNodeRedPort(config, port) {
    return Object.assign({nodeRedCommand: "./node_modules/.bin/node-red -p " + port}, config)
  }

  static async rsync(dst, src) {
    let Rsync = require('rsync');
    let rsync = new Rsync()
      .shell('ssh')
      .flags('ar')
      .source(src)
      .destination(dst);

    // Execute the command
    await new Promise((resolve, reject) => {
      rsync.execute(function(error, code, cmd) {
          resolve();
      });
    });
  }
}
