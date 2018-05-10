/* @flow */
import fetch from 'isomorphic-fetch'
import fs from 'fs'
import Activator from './activator'
import type { ActivationInfo } from './activator'

export default class EnebularActivator extends Activator {
  _verifyURL: ?string
  _activateURL: ?string
  _licenseKey: ?string

  constructor() {
    super()
    let configPath =
      process.env.ACTIVATOR_CONFIG_PATH || '.enebular-activation-config.json'
    this._loadConfig(configPath)
  }

  _loadConfig(configPath: string) {
    if (!fs.existsSync(configPath)) {
      return
    }
    const data = fs.readFileSync(configPath, 'utf8')
    const { enebularBaseURL, licenseKey } = JSON.parse(data)
    if (!enebularBaseURL || !licenseKey) {
      throw new Error('Enebular activation config file missing info')
    }
    this._verifyURL = `${enebularBaseURL}/verify-license`
    this._activateURL = `${enebularBaseURL}/activate-license`
    this._licenseKey = licenseKey
  }

  async canActivate(): ActivatableResult {
    if (!this._verifyURL || !this._activateURL || !this._licenseKey) {
      return {
        canActivate: false,
        message: 'Missing configuration'
      }
    }
    try {
      const res = await fetch(this._verifyURL, {
        method: 'POST',
        body: JSON.stringify({
          licenseKey: this._licenseKey
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      })
      let resJson = await res.json()
      if (!res.ok) {
        let msg = `Failed response (${res.status} ${res.statusText})`
        if (resJson && resJson.message) {
          msg += `: ${resJson.message}`
        }
        throw Error(msg)
      }
      return {
        canActivate: resJson.canActivate,
        message: resJson.canActivate ? null : 'Invalid license key'
      }
    } catch (err) {
      return {
        canActivate: false,
        message: err.message
      }
    }
  }

  async activate(deviceId: string): ActivationResult {
    try {
      const res = await fetch(this._activateURL, {
        method: 'POST',
        body: JSON.stringify({
          licenseKey: this._licenseKey,
          deviceId: deviceId
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      })
      let resJson = await res.json()
      if (!res.ok) {
        let msg = `Failed response (${res.status} ${res.statusText})`
        if (resJson && resJson.message) {
          msg += `: ${resJson.message}`
        }
        throw Error(msg)
      }
      return {
        connectionId: resJson.connectionId,
        authRequestUrl: resJson.authRequestUrl,
        agentManagerBaseUrl: resJson.agentManagerBaseUrl
      }
    } catch (err) {
      throw Error('Activate request failed: ' + err.message)
    }
  }
}
