/* @flow */
import fetch from 'isomorphic-fetch'
import fs from 'fs'
import FormData from 'form-data'
import type { Logger } from 'winston'

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

    const res = await fetch(`${this._baseUrl}/notify-status`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this._accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status })
    })
    if (!res.ok) {
      const resText = await res.text()
      this.debug('Failed to notify status: ' + resText)
    } else {
      this.debug('Status Notified')
    }
  }

  async sendLog(filename: string) {
    if (!this._accessRequirementsConfigured()) {
      throw new Error('Access requirements not configured')
    }

    this.debug(`Sending log (${filename})...`)

    const form = new FormData()
    form.append('events', fs.createReadStream(filename))
    const res = await fetch(`${this._baseUrl}/record-logs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this._accessToken}`
      },
      body: form
    })
    if (!res.ok) {
      const resText = await res.text()
      throw new Error('Failed to send log: ' + resText)
    } else {
      this.debug('Log sent')
    }
  }

  async getDeviceState(states: Array<DeviceStateGetStates>) {
    if (!this._accessRequirementsConfigured()) {
      throw new Error('Access requirements not configured')
    }

    this.debug(`Getting device state...`)

    const res = await fetch(`${this._baseUrl}/device/device-state/get`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this._accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ states: states })
    })
    const resJson = await res.json()
    if (!res.ok) {
      throw new Error('Failed to fetch device state: ' + resJson.message)
    }
    return resJson.states
  }

  async updateDeviceState(updates: Array<DeviceStateStateUpdates>) {
    if (!this._accessRequirementsConfigured()) {
      throw new Error('Access requirements not configured')
    }

    this.debug(`Updating device state...`)

    const res = await fetch(`${this._baseUrl}/device/device-state/update`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this._accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ updates: updates })
    })
    const resJson = await res.json()
    if (!res.ok) {
      throw new Error('Failed to fetch device state update: ' + resJson.message)
    }
    return resJson.updates
  }
}
