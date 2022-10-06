/* @flow */
import fs from 'fs'
import EventEmitter from 'events'
import type DeviceStateManager from './device-state-manager'
import type LogManager from './log-manager'
import type { Logger } from 'winston'

export default class EeConnectorManager extends EventEmitter{
  _deviceStateManager: DeviceStateManager
  _logManager: LogManager
  _log: Logger
  _enabled: boolean = false
  _desiredStateRef: Object

  constructor(
    deviceStateManager: DeviceStateManager,
    logManager: LogManager,
    log: Logger
  ) {
    super()
    this._deviceStateManager = deviceStateManager
    this._logManager = logManager
    this._log = log

    this._deviceStateManager.on('stateChange', params =>
      this._handleDeviceStateChange(params)
    )
  }

  setup() {
    this._updateCloudCommunicationFromDesiredState()
    this._updateCloudCommunicationReportedState()
  }

  async _handleDeviceStateChange(params: { type: string, path: ?string }) {
    if (params.path && !params.path.startsWith('cloudCommunication')) {
      return
    }

    switch (params.type) {
      case 'desired':
        this._updateCloudCommunicationFromDesiredState()
        break
      case 'reported':
        this._updateCloudCommunicationReportedState()
        break
      default:
        break
    }
  }

  _updateCloudCommunicationFromDesiredState() {
    const desiredState = this._deviceStateManager.getState(
      'desired',
      'cloudCommunication'
    )

    if (desiredState && desiredState.hasOwnProperty('enable')) {
      if (desiredState.enable !== this._enabled) {
        this._desiredStateRef = this._deviceStateManager.getRef(
          'desired',
          'cloudCommunication.enable'
        )
        this._enabled = desiredState.enable
        this._log.debug('cloud communication state: ' + desiredState.enable);
        this.emit('cloudCommunicationChanged', desiredState.enable)
        this._updateCloudCommunicationActiveState()
        this._updateCloudCommunicationReportedState()
      }
    }
  }

  _updateCloudCommunicationReportedState() {
    if (!this._deviceStateManager.canUpdateState('reported')) {
      return
    }

    const reportedState = this._deviceStateManager.getState(
      'reported',
      'cloudCommunication'
    )

    if (!reportedState || reportedState.enable !== this._enabled) {
      this._deviceStateManager.updateState(
        'reported',
        'set',
        'cloudCommunication.enable',
        this._enabled,
        this._desiredStateRef
          ? {
              desired: this._desiredStateRef
            }
          : null
      )
    }
  }

}
