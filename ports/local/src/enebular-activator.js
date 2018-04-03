/* @flow */
import { Activator } from 'enebular-runtime-agent'

export default class EnebularActivator extends Activator {
  _licenseKey: ?string

  constructor() {
    super()
    this._licenseKey = 'tmp'
  }

  canActivate(): boolean {
    return !!this._licenseKey
  }

  async activate(deviceId: string): ActivationInfo {
    let info: ActivationInfo = {}
    info.connectionId = '93793d45-827e-49d6-8325-9e53cd339210'
    return info
  }
}
