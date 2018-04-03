/* @flow */
import fetch from 'isomorphic-fetch'
import fs from 'fs'
import { Activator } from 'enebular-runtime-agent'

export default class EnebularActivator extends Activator {
  _activateURL: ?string
  _licenseKey: ?string

  constructor(configPath: string) {
    super()
    this._loadConfig(configPath)
  }

  _loadConfig(configPath: string) {
    if (!fs.existsSync(configPath)) {
      return
    }
    const data = fs.readFileSync(configPath, 'utf8')
    const { activateURL, licenseKey } = JSON.parse(data)
    if (!activateURL || !licenseKey) {
      throw new Error('Config file missing info')
    }
    this._activateURL = activateURL
    this._licenseKey = licenseKey
  }

  canActivate(): boolean {
    return this._activateURL && this._licenseKey
  }

  async activate(info: ActivationInfo): ActivationInfo {
    try {
      let fqDeviceId = `${info.connectionId}::${info.deviceId}`
      const res = await fetch(this._activateURL, {
        method: 'POST',
        body: JSON.stringify({
          licenseKey: this._licenseKey,
          fqDeviceId: fqDeviceId
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      })
      if (!res.ok) {
        let msg = `Failed response (${res.status} ${res.statusText})`
        let resJson = await res.json()
        if (resJson && resJson.message) {
          msg += `: ${resJson.message}`
        }
        throw Error(msg)
      }
    } catch (err) {
      throw Error('Activate request failed: ' + err.message)
    }

    /**
     * We currently do nothing to info, just return it as the success value
     */
    return info
  }
}
