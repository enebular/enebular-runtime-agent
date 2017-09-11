/* @flow */
import EventEmitter from 'events';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

/**
 *
 */
type DeviceAuthResponse = {
  idToken: string,
  accessToken: string,
};

const AUTH_TOKEN_TIMEOUT = 10000;

export default class DeviceAuthMediator extends EventEmitter {
  _authRequestUrl: ?string;
  _nonce: ?string;
  _seq: number = 0;

  constructor(emitter: EventEmitter) {
    super();
    emitter.on('dispatch_auth_token', (message) => this.emit('dispatch_auth_token', message));
  }

  setAuthRequestUrl(authRequestUrl: string) {
    this._authRequestUrl = authRequestUrl;
  }

  async requestAuthenticate(connectionId: string, deviceId: string): Promise<DeviceAuthResponse> {
    const authRequestUrl = this._authRequestUrl;
    if (!authRequestUrl) { throw new Error('Authentication Request URL is not configured correctly'); }
    const nonce = crypto.randomBytes(16).toString('hex');
    this._nonce = nonce;
    this._seq++;
    const state = `req-${this._seq}`;
    const tokens_ = this._waitTokens();
    const res = await fetch(authRequestUrl, {
      method: 'POST',
      body: JSON.stringify({ connectionId, deviceId, nonce, state }),
      headers: {
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) {
      this._cleanup();
      throw new Error('Error occurred while requesting device authentication');
    } else {
      const tokens = await tokens_;
      return tokens;
    }
  }

  async _waitTokens() {
    const seq = this._seq;
    return new Promise((resolve, reject) => {
      this.on('dispatch_auth_token', ({ id_token, access_token, state }) => {
        const { payload } = jwt.decode(id_token);
        if (state === `req-${this._seq}` && payload.nonce && payload.nonce === this._nonce) {
          this._cleanup();
          resolve({ idToken: id_token, accessToken: access_token });
        }
      });
      setTimeout(() => {
        if (this._seq === seq) {
          this._cleanup();
          reject(new Error('Device Authentication Timeout.'));
        }
      }, AUTH_TOKEN_TIMEOUT);
    });
  }

  _cleanup() {
    this._nonce = null;
    this.removeAllListeners('dispatch_auth_token');
  }

}
