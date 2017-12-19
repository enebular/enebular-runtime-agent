/* @flow */
import EventEmitter from 'events';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

type DeviceAuthResponse = {
  idToken: string,
  accessToken: string,
};

const AUTH_TOKEN_TIMEOUT = 10000;

export default class DeviceAuthMediator extends EventEmitter {
  _authRequestUrl: ?string;
  _nonce: ?string;
  _seq: number = 0;
  _log: any;

  requestingAuthenticate: boolean = false;

  constructor(emitter: EventEmitter, log: any) {
    super();
    emitter.on('dispatch_auth_token', (message) => this.emit('dispatch_auth_token', message));
    this._log = log;
  }

  setAuthRequestUrl(authRequestUrl: string) {
    this._authRequestUrl = authRequestUrl;
  }

  async requestAuthenticate(connectionId: string, deviceId: string): Promise<DeviceAuthResponse> {
    this._log.debug('Requesting authenticate...');
    if (this.requestingAuthenticate) {
      throw new Error('Already requesting authenticate');
    }
    this.requestingAuthenticate = true;
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
    this._log.debug('Setting up wait for tokens...');
    const seq = this._seq;
    return new Promise((resolve, reject) => {
      this.on('dispatch_auth_token', ({ idToken, accessToken, state }) => {
        this._log.debug('Tokens received');
        const payload = jwt.decode(idToken);
        this._log.debug('ID token:', payload);
        if (state === `req-${this._seq}` && payload.nonce && payload.nonce === this._nonce) {
          this._log.debug('Accepting tokens');
          this._cleanup();
          resolve({ idToken, accessToken });
        } else {
          this._log.debug('Received tokens are NOT for this device. Ignore.', payload, this._nonce, state, this._seq);
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
    this.requestingAuthenticate = false;
    this._nonce = null;
    this.removeAllListeners('dispatch_auth_token');
  }

}
