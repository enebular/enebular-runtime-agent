/* @flow */
import type Config from './config'
import type DeviceStateManager from './device-state-manager'
import type LogManager from './log-manager'
import type { Logger } from 'winston'

export default class MonitorManager {
  _deviceStateManager: DeviceStateManager
  _logManager: LogManager
  _log: Logger
  _enabled: boolean = true
  _canBeActive: boolean = false
  _active: boolean = false
  _desiredStateRef: Object
  _updateID: ?number
  _intervalFast: number
  _intervalFastPeriod: number
  _intervalNormal: number

  constructor(
    deviceStateManager: DeviceStateManager,
    logManager: LogManager,
    config: Config,
    log: Logger
  ) {
    this._deviceStateManager = deviceStateManager
    this._logManager = logManager
    this._log = log

    this._intervalFast = config.get('ENEBULAR_MONITOR_INTERVAL_FAST')
    this._intervalFastPeriod = config.get(
      'ENEBULAR_MONITOR_INTERVAL_FAST_PERIOD'
    )
    this._intervalNormal = config.get('ENEBULAR_MONITOR_INTERVAL_NORMAL')

    this._deviceStateManager.on('stateChange', params =>
      this._handleDeviceStateChange(params)
    )
  }

  setup() {
    // todo: load from file
    this._updateMonitoringFromDesiredState()
    this._updateMonitoringReportedState()
  }

  async _handleDeviceStateChange(params: { type: string, path: ?string }) {
    if (params.path && !params.path.startsWith('monitoring')) {
      return
    }

    switch (params.type) {
      case 'desired':
        this._updateMonitoringFromDesiredState()
        break
      case 'reported':
        this._updateMonitoringReportedState()
        break
      default:
        break
    }
  }

  _updateMonitoringFromDesiredState() {
    const desiredState = this._deviceStateManager.getState(
      'desired',
      'monitoring'
    )

    if (desiredState && desiredState.hasOwnProperty('enable')) {
      if (desiredState.enable !== this._enabled) {
        this._desiredStateRef = this._deviceStateManager.getRef(
          'desired',
          'monitoring.enable'
        )
        this._enabled = desiredState.enable
        // todo: save to file
        this._updateMonitoringActiveState()
        this._updateMonitoringReportedState()
      }
    }
  }

  _updateMonitoringReportedState() {
    if (!this._deviceStateManager.canUpdateState('reported')) {
      return
    }

    const reportedState = this._deviceStateManager.getState(
      'reported',
      'monitoring'
    )

    if (!reportedState || reportedState.enable !== this._enabled) {
      this._deviceStateManager.updateState(
        'reported',
        'set',
        'monitoring',
        {
          enable: this._enabled
        },
        {
          desired: this._desiredStateRef
        }
      )
    }
  }

  activate(active: boolean) {
    this._canBeActive = active
    this._updateMonitoringActiveState()
  }

  _updateMonitoringActiveState() {
    let shouldBeActive = this._enabled && this._canBeActive
    if (shouldBeActive === this._active) {
      return
    }

    this._active = shouldBeActive

    if (this._active) {
      this._log.info('Activating monitoring...')
      this.refreshMonitoringInterval()
    } else {
      this._log.info('Deactivating monitoring...')
    }

    this._logManager.activateEnebular(this._active)
  }

  refreshMonitoringInterval() {
    if (this._updateID) {
      clearTimeout(this._updateID)
      this._updateID = null
    }
    if (this._active) {
      this._setMonitoringInterval(this._intervalFast)
      this._updateID = setTimeout(() => {
        this._setMonitoringInterval(this._intervalNormal)
      }, this._intervalFastPeriod * 1000)
    }
  }

  _setMonitoringInterval(interval: number) {
    this._log.debug(`Setting monitoring report interval to: ${interval}sec`)
    this._logManager.configureEnebular({
      sendInterval: interval
    })
  }
}
