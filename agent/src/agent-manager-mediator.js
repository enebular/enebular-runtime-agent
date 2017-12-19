/* @flow */
import EventEmitter from 'events';
import fetch from 'isomorphic-fetch';
import fs from 'fs'
import FormData from 'form-data'

export default class AgentManagerMediator {
  _baseUrl: ?string;
  _accessToken: ?string;
  _log: any;

  constructor(log: any) {
    this._log = log;
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

    this._log.debug(`Notifying status (${status})...`);

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
      this._log.debug('Failed to notify status: ' + resText);
    } else {
      this._log.debug('Status Notified');
    }
  }

  async sendLog(filename: string) {

    if (!this._accessRequirementsConfigured()) {
      throw new Error("Access requirements not configured");
    }

    this._log.debug(`Sending log (${filename})...`);

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
      this._log.debug('Log sent');
    }
  }
}
