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
  _remoteLoginState: Object
  _localServerPublicKey: Object
  _relayServerPrivateKey: Object
  _desiredTimeoutId
  _sshStatus
  _localServerActiveStatus
  _relayServerActiveStatus

  constructor(
    deviceStateMan: DeviceStateManager,
    connectorMessenger: ConnectorMessenger,
    agentRunnerMan: AgentRunnerManager,
    log: Logger
  ) {
    this._remoteLoginState = {config: {enable: false}}
    this._desiredTimeoutId = null
    this._sshStatus = false
    this._localServerActiveStatus = false
    this._relayServerActiveStatus = false

    this._deviceStateMan = deviceStateMan
    this._connectorMessenger = connectorMessenger
    this._agentRunnerMan = agentRunnerMan
    this._log = log
    this._deviceStateMan.on('stateChange', params =>
      this._handleDeviceStateChange(params)
    )
    this._agentRunnerMan.on('sshStatusChanged', params => {
      this._info('ssh status:', params)
      this._handleSshStateChange(params)
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

  async _handleSshStateChange(params: { active: boolean }) {
    if (!this._inited) {
      throw new Error('not setup')
    }

    if ((typeof params.active) !== "boolean") {
      throw new TypeError('Parameter Type Error')
      return
    }

    this._localServerActiveStatus = params.active
    this._relayServerActiveStatus = params.active
    if (this._desiredTimeoutId !== null) { // prcessing desired
      this._sshStatus = params.active

      clearTimeout(this._desiredTimeoutId)
      this._desiredTimeoutId = null

      if (this._remoteLoginState.config.enable === params.active) {
        this._remoteLoginState.state = 'current'
        this._updateRemoteLoginReportedState()
        this._updateRemoteLoginStatusState()
      } else {
        this._remoteLoginState.state = 'updateFail'
        this._updateRemoteLoginReportedState()
        this._updateRemoteLoginStatusState()
      }
    } else {
      if (this._sshStatus !== params.active) {
        this._sshStatus = params.active
        if (params.active) { // illegal case
        } else {
          this._relayServerActiveStatus = params.active
          this._updateRemoteLoginStatusState()
        }
      } else {
        this._sshStatus = params.active
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
        if(!params.path) {
          return
        }
        await this._updateRemoteLoginFromDesiredState()
        break
      case 'status':
        let remoteLoginStatusState = this._deviceStateMan.getState('status', 'remoteLogin')
        if (!remoteLoginStatusState) {
          remoteLoginStatusState = {}
        }

        this._localServerActiveStatus = (remoteLoginStatusState.localServerActive === true) ? true : false
        this._relayServerActiveStatus = (remoteLoginStatusState.relayServerConnected === true) ? true : false
        this._sshStatus = this._localServerActiveStatus && this._relayServerActiveStatus
        this._agentRunnerMan.remoteLoginStatusUpdate()
        break
      default:
        break
    }
  }

  async _updateRemoteLoginFromDesiredState() {
    const desiredState = this._deviceStateMan.getState('desired', 'remoteLogin')

    if (!desiredState) {
      return
    }

    if (!desiredState.hasOwnProperty('updateId')) {
      this._error('updateId not exist')
      return
    }

    this._remoteLoginState = JSON.parse(JSON.stringify(desiredState))
    this._debug('RemoteLogin state: ' + JSON.stringify(this._remoteLoginState, null, 2))

    const desiredConfig = desiredState.config || {}
    if (!desiredConfig.hasOwnProperty('enable')) {
      this._error('enable not exist')
      this._remoteLoginState.state = 'updateFail'
      this._remoteLoginState.message = 'enable not exist'
      this._updateRemoteLoginReportedState()
      return
    }

    if (this._sshStatus && (this._remoteLoginState.config.enable === true)) {
      this._error('already remote login feature is enabled')
      this._remoteLoginState.state = 'updateFail'
      this._remoteLoginState.message = 'already remote login feature is enabled'
      this._updateRemoteLoginReportedState()
      return
    }

    if (!this._sshStatus && (this._remoteLoginState.config.enable === false)) {
      this._error('already remote login feature is disabled')
      this._remoteLoginState.state = 'updateFail'
      this._remoteLoginState.message = 'already remote login feature is disabled'
      this._updateRemoteLoginReportedState()
      return
    }

    this._remoteLoginState.state = 'updating'
    this._updateRemoteLoginReportedState()

    try {
      this._processPendingRemoteLoginChanges()

      this._desiredTimeoutId = setTimeout(() => {
        this._desiredTimeoutId = null
        this._remoteLoginState.state = 'updateFail'
        this._remoteLoginState.message = 'Remote maintenance process has timed out'
        this._updateRemoteLoginReportedState()
      }, 30000)
    } catch (err) {
      clearTimeout(this._desiredTimeoutId)
      this._desiredTimeoutId = null

      this._remoteLoginState.state = 'updateFail'
      this._remoteLoginState.message = err.message
      this._updateRemoteLoginReportedState()
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

  _updateRemoteLoginStatusState() {
    if (!this._deviceStateMan.canUpdateState('status')) {
      return
    }

    let remoteLoginStatusState = this._deviceStateMan.getState('status', 'remoteLogin')
    if (!remoteLoginStatusState) {
      remoteLoginStatusState = {}
    }

    const state = {
      localServerActive: this._localServerActiveStatus,
      relayServerConnected: this._relayServerActiveStatus
    }

    this._deviceStateMan.updateState('status', 'set', 'remoteLogin', state)
  }

  async _processPendingRemoteLoginChanges() {
    let certificats = {localServerPublicKeyData: '', relayServerPrivateKeyData: ''}
    if (this._remoteLoginState.config.enable === true) {
      try {
        await this._getRemoteLoginCertificate(certificats)
      } catch (err) {
        throw err
      }
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
      localServerPublicKeyData: certificats.localServerPublicKeyData,
      relayServerPrivateKeyData: certificats.relayServerPrivateKeyData
    }
    try {
      await this._agentRunnerMan.remoteLoginSet(settings)
    } catch (err) {
      throw err
    }
  }

  async _getRemoteLoginCertificate(certificats: { localServerPublicKeyData: String, relayServerPrivateKeyData: String }) {
    var keys
    try {
      keys = await this._downloadCertificate(
        this._remoteLoginState.config.localServerPublicKey.id,
        this._remoteLoginState.config.relayServerPrivateKey.id
      )
    } catch (err) {
      // illegal processing
      this._error('Failed to get URL where key is stored: ' + err.message)
      throw err
    }

    try {
      for (var item in keys) {
        if (keys[item].id === this._remoteLoginState.config.localServerPublicKey.id) {
          certificats.localServerPublicKeyData = await this._fetchCert(
            keys[item].url
          )
        } else if (keys[item].id === this._remoteLoginState.config.relayServerPrivateKey.id) {
          certificats.relayServerPrivateKeyData = await this._fetchCert(
            keys[item].url
          )
        }
      }
    } catch (err) {
      // illegal processing
      this._error('Failed to get key: ' + err.message)
      throw err
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
