/* @flow */
import fetch from 'isomorphic-fetch'

/**
 *
 */
export default class NodeRedAdminApi {
  /**
   *
   */
  constructor(baseUrl) {
    this._baseUrl = baseUrl
  }

  /* @private */
  async _get(method) {
    try {
      const res = await fetch(`${this._baseUrl}/${method}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      })
      if (res.status >= 400) {
        const ret = await res.json()
        throw new Error(ret.message || res.statusText)
      }
      return res.json()
    } catch (err) {
      // console.log('error:', err.message)
    }
  }

  async getFlow() {
    return this._get('flows')
  }

  async getSettings() {
    return this._get('settings')
  }
}
