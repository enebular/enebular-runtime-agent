/* @flow */
import FormData from 'form-data'
import fs from 'fs'
import type { Logger } from 'winston'
import { fetchJSON, postJSON } from './utils'

const moduleName = 'agent-man'

export type DeviceStateGetStates = {
  type: string,
  baseUpdateId: number
}

export type DeviceStateStateUpdates = {
  type: string,
  op: string,
  path: string,
  state: {}
}

export default class AgentManagerMediator {
  _baseUrl: string
  _accessToken: string
  _log: Logger

  constructor(log: Logger) {
    this._log = log
  }

  debug(msg: string, ...args: Array<mixed>) {
    args.push({ module: moduleName })
    this._log.debug(msg, ...args)
  }

  setBaseUrl(baseUrl: string) {
    this._baseUrl = baseUrl
  }

  setAccessToken(accessToken: string) {
    this._accessToken = accessToken
  }

  _accessRequirementsConfigured(): boolean {
    return !!this._baseUrl && !!this._accessToken
  }

  async notifyStatus(status: string) {
    if (!this._accessRequirementsConfigured()) {
      throw new Error('Access requirements not configured')
    }

    this.debug(`Notifying status (${status})...`)

    try {
      await postJSON(
        `${this._baseUrl}/notify-status`,
        JSON.stringify({ status }),
        {
          headers: {
            Authorization: `Bearer ${this._accessToken}`
          }
        }
      )
      this.debug('Status notified')
    } catch (err) {
      this.debug('Failed to notify status: ' + err.message)
    }
  }

  async sendLog(filename: string) {
    if (!this._accessRequirementsConfigured()) {
      throw new Error('Access requirements not configured')
    }

    this.debug(`Sending log (${filename})...`)

    const form = new FormData()
    form.append('events', fs.createReadStream(filename))

    try {
      await fetchJSON(`${this._baseUrl}/record-logs`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this._accessToken}`
        },
        body: form
      })
      this.debug('Log sent')
    } catch (err) {
      // throw new Error(
      //   'FILENAME: ' + filename + ' Failed to send log: ' + err.message
      // )
    }
  }

  async getDeviceState(states: Array<DeviceStateGetStates>) {
    if (!this._accessRequirementsConfigured()) {
      throw new Error('Access requirements not configured')
    }

    this.debug('Getting device state...')

    try {
      const res = await postJSON(
        `${this._baseUrl}/device/device-state/get`,
        JSON.stringify({ states: states }),
        {
          headers: {
            Authorization: `Bearer ${this._accessToken}`
          }
        }
      )
      return res.states
    } catch (err) {
      throw new Error('Device state get request failed: ' + err.message)
    }
  }

  async updateDeviceState(updates: Array<DeviceStateStateUpdates>) {
    if (!this._accessRequirementsConfigured()) {
      throw new Error('Access requirements not configured')
    }

    this.debug('Updating device state...')

    try {
      const res = await postJSON(
        `${this._baseUrl}/device/device-state/update`,
        JSON.stringify({ updates: updates }),
        {
          headers: {
            Authorization: `Bearer ${this._accessToken}`
          }
        }
      )
      return res.updates
    } catch (err) {
      throw new Error('Device state update request failed: ' + err.message)
    }
  }

  async getInternalFileAssetDataUrl(key: string) {
    if (!this._accessRequirementsConfigured()) {
      throw new Error('Access requirements not configured')
    }

    this.debug('Getting internal file data url...')

    try {
      const res = await postJSON(
        `${this._baseUrl}/device/assets/get-internal-file-data-url`,
        JSON.stringify({ key: key }),
        {
          headers: {
            Authorization: `Bearer ${this._accessToken}`
          }
        }
      )
      return res.url
    } catch (err) {
      throw new Error('Internal file data url request failed: ' + err.message)
    }
  }

  async getAiModelWrapperUrl(params: Object) {
    if (!this._accessRequirementsConfigured()) {
      throw new Error('Access requirements not configured')
    }
    this.debug('Getting ai model wrapper url...')
    try {
      const res = await postJSON(
        `${this._baseUrl}/device/assets/get-ai-model-wrapper-url-test`,
        JSON.stringify({ params: params }),
        {
          headers: {
            Authorization: `Bearer ${this._accessToken}`
          }
        }
      )
      return res.url
    } catch (err) {
      throw new Error('Ai model wrapper url request failed: ' + err.message)
    }
  }
}
