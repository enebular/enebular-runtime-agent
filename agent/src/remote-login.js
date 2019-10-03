/* @flow */

import type DeviceStateManager from './device-state-manager'
import type { Logger } from 'winston'
import AgentRunnerManager from './agent-runner-manager'

const moduleName = 'remote-login'

export default class RemoteLogin {
  _deviceStateMan: DeviceStateManager
  _connectorMessenger: ConnectorMessenger
  _agentRunnerMan: AgentRunnerManager
  _log: Logger
  _inited: boolean = false
  _pendingEnableRequest: boolean = false
  _remoteLoginState: Object
  _localServerPublicKey: Object
  _relayServerPrivateKey: Object

  constructor(
    deviceStateMan: DeviceStateManager,
    connectorMessenger: ConnectorMessenger,
    agentRunnerMan: AgentRunnerManager,
    log: Logger
  ) {
    this._remoteLoginState = {config: {enable: false}}

    this._deviceStateMan = deviceStateMan
    this._connectorMessenger = connectorMessenger
    this._agentRunnerMan = agentRunnerMan
    this._log = log
    this._deviceStateMan.on('stateChange', params =>
      this._handleDeviceStateChange(params)
    )
    this._agentRunnerMan.on('sshServerStatusChanged', params => {
      this._info('ssh server status:', params)
      this._handleSshServerStateChange(params)
    })
    this._agentRunnerMan.on('sshClientStatusChanged', params => {
      this._info('ssh client status:', params)
      this._handleSshClientStateChange(params)
    })
  }

  _error(msg: string, ...args: Array<mixed>) {
    args.push({ module: moduleName })
    this._log.error(msg, ...args)
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

  async _handleSshServerStateChange(params: { active: boolean }) {
    if (!this._inited) {
      throw new Error('not setup')
    }

    if ((typeof params.active) !== 'boolean') {
      throw new TypeError('Parameter Type Error')
      return
    }

    // デバイスステート status 更新 (差分更新)
    if (this._remoteLoginState.config.enable !== params.active) {
      this._remoteLoginState.config.enable = params.active
      this._updateRemoteLoginStatusState()
      // true -> false : リモートログイン OFF を runner へ依頼
      if (this._remoteLoginState.config.enable === false) {
        this._enableRequest()
        this._processPendingRemoteLoginChanges()
      }
    }
  }

  async _handleSshClientStateChange(params: { connected: boolean }) {
    if (!this._inited) {
      throw new Error('not setup')
    }

    if ((typeof params.connected) !== 'boolean') {
      throw new TypeError('Parameter Type Error')
      return
    }

    // デバイスステート status 更新 (差分更新)
    if (this._remoteLoginState.config.enable !== params.connected) {
      this._remoteLoginState.config.enable = params.connected
      this._updateRemoteLoginStatusState()
      // true -> false : リモートログイン OFF を runner へ依頼
      if (this._remoteLoginState.config.enable === false) {
        this._enableRequest()
        this._processPendingRemoteLoginChanges()
      }
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

    const desiredConfig = desiredState.config || {}
    const preEnable = this._remoteLoginState.config.enable

    let enableRequest = false
    if (desiredConfig.hasOwnProperty('updateId')) {
      if (desiredConfig.hasOwnProperty('enable')) {
        if (preEnable !== desiredConfig.enable) {
          this._remoteLoginState = JSON.parse(JSON.stringify(desiredState))
          this._remoteLoginState.state = 'updating'
          enableRequest = true
        }
      } else {
        this._remoteLoginState = JSON.parse(JSON.stringify(desiredState))
        this._remoteLoginState.state = 'updateFail'
        this._remoteLoginState.message = 'enable not exist'
        enableRequest = true
        this._error('enable not exist')
      }
    } else {
      this._error('updateId not exist')
      return
    }

    if (!enableRequest) {
      return
    }

    // SSH Key Check
    if (!desiredConfig.hasOwnProperty('localServerPublicKey') || !desiredConfig.hasOwnProperty('relayServerPrivateKey')) {
      // illegal processing
      this._error('Key not exist')
    }

    this._remoteLoginState.enableDesiredStateRef = this._deviceStateMan.getRef(
      'desired',
      'remoteLogin.config.enable'
    )
    this._enableRequest()

    this._debug(
      'RemoteLogin state: ' + JSON.stringify(this._remoteLoginState, null, 2)
    )

    this._updateRemoteLoginReportedState()

    if (this._remoteLoginState.state === 'updateFail') {
      return
    }

    let procStat = true
    this._remoteLoginState.state = 'current'
    try {
      this._processPendingRemoteLoginChanges()
    } catch (err) {
      procStat = false
      this._remoteLoginState.state = 'updateFail'
      this._remoteLoginState.message = err.massage
    }
    this._updateRemoteLoginStatusState()
    this._updateRemoteLoginReportedState()

    if (!procStat) {
      this._remoteLoginState.config.enable = preEnable
    }
  }

  _updateRemoteLoginReportedState() {
    if (!this._deviceStateMan.canUpdateState('reported')) {
      return
    }

    let reportedState = this._deviceStateMan.getState('reported', 'remoteLogin')
    if (!reportedState) {
      reportedState = {}
    }

    let state = {
      config: {
        enable: this._remoteLoginState.config.enable,
        localUser: this._remoteLoginState.config.localUser,
        localServerPublicKey: {
          id: this._remoteLoginState.config.localServerPublicKey.id
        },
        relayServer: this._remoteLoginState.config.relayServer,
        relayServerPort: this._remoteLoginState.config.relayServerPort,
        relayServerUser: this._remoteLoginState.config.relayServerUser,
        relayServerPrivateKey: {
          id: this._remoteLoginState.config.relayServerPrivateKey.id
        }
      },
      updateId: this._remoteLoginState.updateId,
      state: this._remoteLoginState.state
    }

    if (this._remoteLoginState.state === 'updateFail') {
      state.message = this._remoteLoginState.message
    }

    this._deviceStateMan.updateState('reported', 'set', 'remoteLogin', state)
  }

  _updateRemoteLoginStatusState()  {
    if (!this._deviceStateMan.canUpdateState('status')) {
      return
    }

    let remoteLoginStatusState = this._deviceStateMan.getState('status', 'remoteLogin')
    if (!remoteLoginStatusState) {
      remoteLoginStatusState = {}
    }

    const state = {
      localServerActive: this._remoteLoginState.config.enable,
      relayServerConnected: this._remoteLoginState.config.enable
    }

    this._deviceStateMan.updateState('status', 'set', 'remoteLogin', state)
  }

  async _processPendingRemoteLoginChanges() {
    if (this._pendingEnableRequest) {
      var keys
      try {
        keys = await this._downloadCertificate(
          this._remoteLoginState.config.localServerPublicKey.id,
          this._remoteLoginState.config.relayServerPrivateKey.id
        )

        this._debug(
          'RemoteLogin keys: ' + JSON.stringify(keys, null, 2)
        )
      } catch (err) {
        // illegal processing
        this._error('RemoteLogin failed: ' + err.message)
      }

      var localServerPublicKeyData
      var relayServerPrivateKeyData
      try {
        for (var item in keys) {
          if (keys[item].id === this._remoteLoginState.config.localServerPublicKey.id) {
            localServerPublicKeyData = await this._fetchCert(
              keys[item].url
            )
          } else if (keys[item].id === this._remoteLoginState.config.relayServerPrivateKey.id) {
            relayServerPrivateKeyData = await this._fetchCert(
              keys[item].url
            )
          }
        }
      } catch (err) {
        // illegal processing
        this._error('RemoteLogin failed: ' + err.message)
      }

      const fs = require('fs')
      const path = require('path')
      let settings = {
        config: {
          enable: this._remoteLoginState.config.enable,
          localUser: this._remoteLoginState.config.localUser,
          localServerPublicKey: {
            id: this._remoteLoginState.config.localServerPublicKey.id,
            size: this._remoteLoginState.config.localServerPublicKey.size,
            signature: this._remoteLoginState.config.localServerPublicKey.signature
          },
          relayServer: this._remoteLoginState.config.relayServer,
          relayServerPort: this._remoteLoginState.config.relayServerPort,
          relayServerUser: this._remoteLoginState.config.relayServerUser,
          relayServerPrivateKey: {
            id: this._remoteLoginState.config.relayServerPrivateKey.id,
            size: this._remoteLoginState.config.relayServerPrivateKey.size,
            signature: this._remoteLoginState.config.relayServerPrivateKey.signature
          }
        },
        signature: this._remoteLoginState.signature,
        localServerPublicKeyData: localServerPublicKeyData,
        relayServerPrivateKeyData: relayServerPrivateKeyData
      }
      try {
        await this._agentRunnerMan.remoteLoginSet(settings)
      } catch (err) {
        throw err
      }

      this._pendingEnableRequest = false
    }
  }

  async _fetchCert(downloadUrl: string) {

    var keys
    await fetch(downloadUrl)
    .then(response => {
      if (response.ok) {
        keys = response.text()
      } else {
        return Promise.reject(new Error(`Failed response (${response.status} ${response.statusText})`))
      }
    })

    return keys
  }

  async _downloadCertificate(localServerPublicKeyId: string, relayServerPrivateKeyId: string) {
    let keyIds = {
      keyIds: [
        localServerPublicKeyId,
        relayServerPrivateKeyId
      ]
    }

    var res
    try {
        res = await this._connectorMessenger.sendRequest(
        'remoteLogin/device/getKeyDataUrl',
        keyIds
      )
      this._debug(
        'remoteLogin/device/getKeyDataUrl res: ' + JSON.stringify(res, null, 2)
      )
    } catch (err) {
      throw new Error('remoteLogin/device/getKeyDataUrl sendRequest error')
    }

    if (!res.hasOwnProperty('keys')) {
      throw new Error('keys is not exist')
    }
    const keys = res.keys || {}
    return keys
  }
}
