/* @flow */
import EventEmitter from 'events';
import fetch from 'isomorphic-fetch';
import debug from 'debug';
import fs from 'fs'
import FormData from 'form-data'

const log = debug('enebular-runtime-agent:agent-manager-mediator');

export default class AgentManagerMediator {
  _baseUrl: ?string;
  _accessToken: ?string;

  constructor() {
    //
  }

  setBaseUrl(baseUrl: string) {
    this._baseUrl = baseUrl;
  }

  setAccessToken(accessToken: string) {
    this._accessToken = accessToken;
  }

  _accessRequirementsConfigured(): boolean {
    return (this._baseUrl && this._accessToken);
  }

  async notifyStatus(status: string) {

    if (!this._accessRequirementsConfigured()) {
      throw new Error("Access requirements not configured");
    }

    log(`Notifying status (${status})...`);
    const res = await fetch(`${this._baseUrl}/notify-status`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this._accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const resText = await res.text();
      log('Failed to notify status: ' + resText);
    } else {
      log('Status Notified');
    }
  }

  async sendLog(filename: string) {

    if (!this._accessRequirementsConfigured()) {
      throw new Error("Access requirements not configured");
    }

    const form = new FormData();
    form.append("events", fs.createReadStream(filename))
    const res = await fetch(`${this._baseUrl}/record-logs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this._accessToken}`,
      },
      body: form
    });
    if (!res.ok) {
      const resText = await res.text();
      throw new Error('Failed to send log: ' + resText);
    } else {
      log('Log sent');
    }
  }
}
