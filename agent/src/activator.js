/* @flow */

export type ActivatableResult = {
  canActivate: boolean,
  message?: string
}

export type ActivationResult = {
  connectionId: string,
  authRequestUrl: string,
  agentManagerBaseUrl: string
}

export default class Activator {
  async canActivate(): ActivatableResult {
    throw new Error('Called an abstract function')
  }

  async activate(deviceId: string): ActivationResult {
    throw new Error('Called an abstract function')
  }
}
