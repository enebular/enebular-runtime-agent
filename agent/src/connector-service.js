/* @flow */
import EventEmitter from 'events'

export type ConnectorInit = (config: Config) => void
export type ConnectorRegisterConfig = (config: Config) => void

export default class ConnectorService extends EventEmitter {
  _active: boolean = false
  _registered: boolean = false
  _connected: boolean = false
  _deviceId: string
  _init: ConnectorInit
  _registerConfig: ConnectorRegisterConfig

  constructor(init: ConnectorInit, registerConfig: ConnectorRegisterConfig) {
    super()
    this._init = init
    this._registerConfig = registerConfig
  }

  get active(): boolean {
    return this._active
  }

  get connected(): boolean {
    return this._connected
  }

  get registered(): boolean {
    return this._registered
  }

  get deviceId(): string {
    return this._deviceId
  }

  updateActiveState(active: boolean) {
    if (active === this._active) {
      return
    }
    this._active = active
    this.emit('activeChange')
  }

  updateRegistrationState(registered: boolean, deviceId: string) {
    this._registered = registered
    this._deviceId = deviceId
    this.emit('registrationChange')
  }

  updateConnectionState(connected: boolean) {
    if (connected === this._connected) {
      return
    }
    this._connected = connected
    this.emit('connectionChange')
  }

  sendMessage(messageType: string, message: any) {
    this.emit('message', { messageType: messageType, message: message })
  }
}
