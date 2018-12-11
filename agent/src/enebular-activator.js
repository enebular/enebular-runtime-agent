/* @flow */
import fs from 'fs'
import { postJSON } from './utils'

export type ActivatableResult = {
  canActivate: boolean,
  message?: string
}

export type ActivationResult = {
  connectionId: string,
  authRequestUrl: string,
  agentManagerBaseUrl: string
}

export default class EnebularActivator {
  _enabled: boolean = false
  _verifyURL: ?string
  _activateURL: ?string
  _licenseKey: ?string

  constructor(configPath: string) {
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
    this._enabled = true
  }

  enabled(): boolean {
    return this._enabled
  }

  async canActivate(): ActivatableResult {
    if (!this._verifyURL || !this._activateURL || !this._licenseKey) {
      return {
        canActivate: false,
        message: 'Missing configuration'
      }
    }
    try {
      const res = await postJSON(
        this._verifyURL,
        JSON.stringify({
          licenseKey: this._licenseKey
        })
      )
      return {
        canActivate: res.canActivate,
        message: res.canActivate ? null : 'Invalid license key'
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
      const res = await postJSON(
        this._activateURL,
        JSON.stringify({
          licenseKey: this._licenseKey,
          deviceId: deviceId
        })
      )
      return {
        connectionId: res.connectionId,
        authRequestUrl: res.authRequestUrl,
        agentManagerBaseUrl: res.agentManagerBaseUrl
      }
    } catch (err) {
      throw Error('Activate request failed: ' + err.message)
    }
  }
}
