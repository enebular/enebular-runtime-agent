/* @flow */

type ActivationInfo = {
  connectionId: string
}

export default class Activator {
  canActivate(): boolean {
    throw new Error('Called an abstract function')
  }

  async activate(deviceId: string): ActivationInfo {
    throw new Error('Called an abstract function')
  }
}
