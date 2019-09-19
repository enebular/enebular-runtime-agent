/* @flow */

import type DeviceStateManager from './device-state-manager'
import type { Logger } from 'winston'
import AgentRunnerManager from './agent-runner-manager'

const moduleName = 'remote-login'

export default class RemoteLogin {
  _deviceStateMan: DeviceStateManager
  _agentRunnerMan: AgentRunnerManager
  _log: Logger
  _inited: boolean = false
  _pendingEnableRequest: boolean = false
  _remoteLoginState: Object = {config:Object}

  constructor(
    deviceStateMan: DeviceStateManager,
    agentRunnerMan: AgentRunnerManager,
    log: Logger
  ) {
    this._deviceStateMan = deviceStateMan
    this._agentRunnerMan = agentRunnerMan
    this._log = log
    this._deviceStateMan.on('stateChange', params =>
      this._handleDeviceStateChange(params)
    )
    this._agentRunnerMan.on('sshServerStatusChanged', params =>
      this._info('ssh server status:', params)
    )
    this._agentRunnerMan.on('sshClientStatusChanged', params =>
      this._info('ssh client status:', params)
    )
  }

  _info(msg: string, ...args: Array<mixed>) {
    args.push({ module: moduleName })
    this._log.info(msg, ...args)
  }

  _debug(msg: string, ...args: Array<mixed>) {
    args.push({ module: moduleName })
    this._log.debug(msg, ...args)
  }

  async setup() {
    if (this._inited) {
      return
    }

    this._inited = true
  }

  _enableRequest() {
    if (!this._pendingEnableRequest) {
      this._pendingEnableRequest = true
    }
  }

  async _handleDeviceStateChange(params: { type: string, path: ?string }) {
    if (!this._inited) {
      return
    }

    if (params.path && !params.path.startsWith('remoteLogin')) {
      return
    }

    switch (params.type) {
      case 'desired':
        this._updateRemoteLoginFromDesiredState()
        break
      case 'reported':
        this._updateRemoteLoginReportedState()
        break
      case 'status':
        this._updateRemoteLoginStatusState()
        break
      default:
        break
    }
  }

  _updateRemoteLoginFromDesiredState() {
    const desiredState = this._deviceStateMan.getState('desired', 'remoteLogin')
    if (!desiredState) {
      return
    }

//    const desiredRemoteLogin = desiredState.remoteLogin || {}
    const desiredConfig = desiredState.config || {}

    let change = false

    let enableRequest = false
    if (desiredConfig.hasOwnProperty('enable')) {
      if (this._remoteLoginState.config.enable !== desiredConfig.enable) {
        this._remoteLoginState.config.enable = desiredConfig.enable
        enableRequest = true
      }
    } else {
      // enable is undefined or false
      if (!this._remoteLoginState.config.enable) {
        // the default enable state is true
        this._remoteLoginState.config.enable = true
        enableRequest = true
      }
    }
    if (enableRequest) {
      this._remoteLoginState.enableDesiredStateRef = this._deviceStateMan.getRef(
        'desired',
        'remoteLogin.config.enable'
      )
      this._enableRequest()
      change = true
    }

    this._debug(
      'RemoteLogin state: ' + JSON.stringify(this._remoteLoginState, null, 2)
    )

    if (change) {
      this._updateRemoteLoginStatusState()
      this._updateRemoteLoginReportedState()
      this._processPendingRemoteLoginChanges()
    }
  }

  _updateRemoteLoginReportedState() {
    this._debug(
      '********** _updateRemoteLoginReportedState *******************')
  }

  _updateRemoteLoginStatusState()  {
    this._debug(
      '********** _updateRemoteLoginStatusState *******************')
  }

  _processPendingRemoteLoginChanges() {
    this._debug(
      '********** _processPendingRemoteLoginChanges *******************')
    if (this._pendingEnableRequest) {
/*
      this._agentRunnerMan.remoteLogin({
        enable: true,
        signature: 'random'
      })
*/
      const fs = require('fs')
      const path = require('path')
      let settings = {
        config: {
          enable: true,
          localUser: 'vagrant',
          localServerPublicKey: {
            data: fs.readFileSync(
              path.resolve(__dirname, '../keys/ssh/device_pubkey.pem'),
              'utf8'
            )
          },
          relayServer: 'ec2-52-25-60-131.us-west-2.compute.amazonaws.com',
          relayServerPort: '10022',
          relayServerUser: 'serverUser',
          relayServerPrivateKey: {
            data: fs.readFileSync(
              path.resolve(__dirname, '../keys/ssh/global_server_privkey.pem'),
              'utf8'
            )
          }
        },
      }
      try {
//        await this._agentRunnerMan.remoteLoginSet(settings)
        this._agentRunnerMan.remoteLoginSet(settings)
      } catch (err) {
        this._info('RemoteLogin failed: ' + err.message)
      }

      this._pendingEnableRequest = false
    }
  }

  async test() {
    const objectHash = require('object-hash')
    const fs = require('fs')
    const path = require('path')
    const crypto = require('crypto')
    let settings = {
      config: {
        enable: true,
        localUser: 'pi',
        localServerPublicKey: {
          data: fs.readFileSync(
            path.resolve(__dirname, '../keys/ssh/local_server_pubkey.pem'),
            'utf8'
          )
        },
        relayServer: '13.210.139.107',
        relayServerPort: '10023',
        relayServerUser: 'ssh_test',
        relayServerPrivateKey: {
          data: fs.readFileSync(
            path.resolve(__dirname, '../keys/ssh/relay_server_privkey.pem'),
            'utf8'
          )
        }
      },
    }
    /*
    // For test only
    const privKey = fs.readFileSync(
      path.resolve(__dirname, '../keys/enebular/privkey.pem'),
      'utf8'
    )
    let sign = crypto.createSign('SHA256')
    sign.update(settings.config.localServerPublicKey.data)
    settings.config.localServerPublicKey.signature = sign.sign(privKey, 'base64')

    sign = crypto.createSign('SHA256')
    sign.update(settings.config.relayServerPrivateKey.data)
    settings.config.relayServerPrivateKey.signature = sign.sign(privKey, 'base64')

    const hash = objectHash(settings.config, {
      algorithm: 'sha256',
      encoding: 'base64'
    })
    sign = crypto.createSign('SHA256')
    sign.update(hash)
    settings.signature = sign.sign(privKey, 'base64')
    */

    try {
      await this._agentRunnerMan.remoteLoginSet(settings)
    } catch (err) {
      this._info('RemoteLogin failed: ' + err.message)
    }

    setTimeout(async () => {
      settings = {
        config: {
          enable: false,
        }
      }
      /*
      const hash = objectHash(settings.config, {
        algorithm: 'sha256',
        encoding: 'base64'
      })
      sign = crypto.createSign('SHA256')
      sign.update(hash)
      settings.signature = sign.sign(privKey, 'base64')
      */
      try {
        await this._agentRunnerMan.remoteLoginSet(settings)
      } catch (err) {
        this._info('RemoteLogin failed: ' + err.message)
      }
    }, 1000 * 1000)
  }
}
