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
        this._updateRemoteLoginStatusState()
        this._updateRemoteLoginReportedState()
      } else {
        this._remoteLoginState.state = 'updateFail'
        this._updateRemoteLoginStatusState()
        this._updateRemoteLoginReportedState()
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
      this._error('Request format is incorrect')
      return
    }

    this._remoteLoginState = JSON.parse(JSON.stringify(desiredState))
    this._debug('RemoteLogin state: ' + JSON.stringify(this._remoteLoginState, null, 2))

    const desiredConfig = desiredState.config || {}
    if (!desiredConfig.hasOwnProperty('enable')) {
      this._error('Request format is incorrect')
      this._remoteLoginState.state = 'updateFail'
      this._remoteLoginState.message = 'Request format is incorrect'
      this._updateRemoteLoginReportedState()
      return
    }

    if (this._sshStatus && (this._remoteLoginState.config.enable === true)) {
      this._error('Remote Maintenance is already enabled')
      this._remoteLoginState.state = 'updateFail'
      this._remoteLoginState.message = 'Remote Maintenance is already enabled'
      this._updateRemoteLoginReportedState()
      return
    }

    if (!this._sshStatus && (this._remoteLoginState.config.enable === false)) {
      this._error('Remote Maintenance is already disabled')
      this._remoteLoginState.state = 'updateFail'
      this._remoteLoginState.message = 'Remote Maintenance is already disabled'
      this._updateRemoteLoginReportedState()
      return
    }

    this._remoteLoginState.state = 'updating'
    this._updateRemoteLoginReportedState()

    let isUpdateSign = false // 署名用公開鍵更新フラグ
    let curSignPublicKey = '' // 署名用公開鍵更新フラグ
    let certificats = {localServerPublicKeyData: '', relayServerPrivateKeyData: ''}

    try {
      this._desiredTimeoutId = setTimeout(() => {
        this._error('Remote Maintenance request timed out')
        this._desiredTimeoutId = null
        this._remoteLoginState.state = 'updateFail'
        this._remoteLoginState.message = 'Remote Maintenance request timed out'
        this._updateRemoteLoginReportedState()
      }, 20000)

      if (this._remoteLoginState.config.enable === true) {
        try {
          this._info('Start getting Certificate')
          await this._getRemoteLoginCertificate(certificats)
        } catch (err) {
          // エラー処理
          if(this._desiredTimeoutId !== null) {
            clearTimeout(this._desiredTimeoutId)
            this._error(err.message)
            this._desiredTimeoutId = null
            this._desiredProcStatus = 0x00
            this._remoteLoginState.state = 'updateFail'
            this._remoteLoginState.message = err.message
            this._updateRemoteLoginReportedState()
            return
          }
        }
      }
      if(this._desiredTimeoutId !== null) {
        this._info('requesting to agent runner')
        await this._processPendingRemoteLoginChanges(certificats)
      }
    } catch (err) {
      this._info('failed to request to agent runner')
      clearTimeout(this._desiredTimeoutId)
      this._desiredTimeoutId = null
      this._desiredProcStatus = 0x00

      if (err.code === 'ERR_INVALID_SIGNATURE') {
        isUpdateSign = true
        curSignPublicKey = err.info.publicKeyId
      } else {
        this._error(err.message)
        this._remoteLoginState.state = 'updateFail'
        this._remoteLoginState.message = err.message
        this._updateRemoteLoginReportedState()
      }
    }

    if (isUpdateSign) {
      try {
        this._info('download new signing key')
        let res = await this._downloadNewSignPublicKey(curSignPublicKey)
        let rowkey = new Buffer(res.key,'base64').toString('utf-8')
        let settings = { id: res.id, signature: res.signature, key: rowkey }
        this._info('requesting to rotate public key')
        await this._agentRunnerMan.rotatePublicKey(settings)

        // retry
        this._desiredTimeoutId = setTimeout(() => {
          this._error('Remote Maintenance request timed out')
          this._desiredTimeoutId = null
          this._remoteLoginState.state = 'updateFail'
          this._remoteLoginState.message = 'Remote Maintenance request timed out'
          this._updateRemoteLoginReportedState()
        }, 20000)
        this._info('requesting to agent runner(retry)')
        await this._processPendingRemoteLoginChanges(certificats)
      } catch (err) {
        this._error(err.message)
        clearTimeout(this._desiredTimeoutId)
        this._desiredTimeoutId = null
        this._desiredProcStatus = 0x00
        this._remoteLoginState.state = 'updateFail'
        this._remoteLoginState.message = err.message
        this._updateRemoteLoginReportedState()
      }
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

    if (this._sshStatus) {
      state.localUser = this._remoteLoginState.config.localUser
      state.relayServer = this._remoteLoginState.config.relayServer
      state.relayServerPort = this._remoteLoginState.config.relayServerPort
      state.relayServerUser = this._remoteLoginState.config.relayServerUser
    }

    this._deviceStateMan.updateState('status', 'set', 'remoteLogin', state)
  }

  async _processPendingRemoteLoginChanges(certificats: Object) {
    
    if (certificats.hasOwnProperty('localServerPublicKeyData') && certificats.hasOwnProperty('relayServerPrivateKeyData')) {
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
  }

  async _getRemoteLoginCertificate(certificats: { localServerPublicKeyData: String, relayServerPrivateKeyData: String }) {
    var keys
    try {
      keys = await this._downloadCertificate(
        this._remoteLoginState.config.localServerPublicKey.id,
        this._remoteLoginState.config.relayServerPrivateKey.id
      )
    } catch (err) {
      throw new Error('Remote Maintenance Certificate request failed')
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
      throw new Error('Remote Maintenance Certificate request failed')
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
      throw new Error('Remote Maintenance Certificate request failed')
    }

    if (!res.hasOwnProperty('keys')) {
      throw new Error('Remote Maintenance Certificate request failed')
    }
    const keys = res.keys || {}
    return keys
  }

  async _downloadNewSignPublicKey(currentSignPublicKey) {
    let res
    try {
      let body = { id: currentSignPublicKey }
      this._debug('signing/device/getKey body: ' + JSON.stringify(body, null, 2))
      res = await this._connectorMessenger.sendRequest('signing/device/getKey', body)
      this._debug('signing/device/getKey res: ' + JSON.stringify(res, null, 2))
    } catch (err) {
      throw new Error('Remote Maintenance new sign public Key request failed')
    }

    if (!res.hasOwnProperty('key')) {
      throw new Error('Remote Maintenance new sign public Key request failed')
    }

    if (currentSignPublicKey === res.id) {
      throw new Error('Remote Maintenance new sign public Key is already saved')
    }
    
    return res
  }
}
