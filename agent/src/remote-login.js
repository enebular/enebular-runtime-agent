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
  _remoteLoginState: Object = {}

  constructor(deviceStateMan: DeviceStateManager, agentRunnerMan: AgentRunnerManager, log: Logger) {
    this._deviceStateMan = deviceStateMan
    this._agentRunnerMan = agentRunnerMan
    this._log = log
    this._deviceStateMan.on('stateChange', params =>
      this._handleDeviceStateChange(params)
    )
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

    const desiredRemoteLogin = desiredState.remoteLogin || {}

    this._debug('Desired state change: ' + JSON.stringify(desiredState, null, 2))

    let change = false

    let enableRequest = false
    if (desiredState.hasOwnProperty('enable')) {
      if (this._remoteLoginState.enable !== desiredState.enable) {
        this._remoteLoginState.enable = desiredState.enable
        enableRequest = true
      }
    } else {
      // enable is undefined or false
      if (!this._remoteLoginState.enable) {
        // the default enable state is true
        this._remoteLoginState.enable = true
        enableRequest = true
      }
    }
    if (enableRequest) {
      this._remoteLoginState.enableDesiredStateRef = this._deviceStateMan.getRef(
        'desired',
        'remoteLogin.enable'
      )
      this._enableRequest()
      change = true
    }

    this._debug('RemoteLogin state: ' + JSON.stringify(this._remoteLoginState, null, 2))

    if (change) {
      this._updateRemoteLoginStatusState()
      this._updateRemoteLoginReportedState()
      this._processPendingRemoteLoginChanges()
    }

  }

  _updateRemoteLoginReportedState() {
  }

  _updateRemoteLoginStatusState() {
  }

  _processPendingRemoteLoginChanges() {
    if (this._pendingEnableRequest) {
      this._agentRunnerMan.remoteLogin({ 
        enable: true,
        signature: "random"
      })
      this._pendingEnableRequest = false
    }
  }

  test() {
    const objectHash = require('object-hash')
    const fs = require('fs')
    const path = require('path')
    const crypto = require('crypto')

    let settings = { 
      enable: true,
      config: {
          options: {
            deviceUser: 'suyouxin',
            serverIPaddr: '192.168.2.156',
            serverPort: '22',
            serverUser: 'suyouxin',
            identify: path.resolve(__dirname, '../keys/privkey.pem')
          }
      }
    }
    // For test only
    const hash = objectHash(settings, { algorithm: 'sha256', encoding: 'base64' })
    const privKeyPath = path.resolve(__dirname, '../keys/privkey.pem')
    const privKey = fs.readFileSync(privKeyPath, 'utf8')
    let sign = crypto.createSign('SHA256')
    sign.update(hash)
    let signature = sign.sign(privKey, 'base64')
    this._agentRunnerMan.remoteLogin(settings, signature)

    setTimeout(() => {
      settings = {
        enable: false
      }
      const hash = objectHash(settings, { algorithm: 'sha256', encoding: 'base64' })
      sign = crypto.createSign('SHA256')
      sign.update(hash)
      signature = sign.sign(privKey, 'base64')
      this._agentRunnerMan.remoteLogin(settings, signature)
    }, 10000);
  }
}
 
