/* @flow */

type ActivationInfo = {
  connectionId: string,
  deviceId: string
}

export default class Activator {
  canActivate(): boolean {
    throw new Error('Called an abstract function')
  }

  async activate(info: ActivationInfo): ActivationInfo {
    throw new Error('Called an abstract function')
  }
}
