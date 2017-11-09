/* @flow */
import EventEmitter from 'events';
import crypto from 'crypto';
import debug from 'debug';
import jwt from 'jsonwebtoken';

/**
 *
 */
const log = debug('enebular-runtime-agent:device-auth-mediator');

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
    log('requestAuthenticate', connectionId, deviceId);
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
      log('tokens', tokens)
      return tokens;
    }
  }

  async _waitTokens() {
    log('_waitTokens');
    const seq = this._seq;
    return new Promise((resolve, reject) => {
      this.on('dispatch_auth_token', ({ idToken, accessToken, state }) => {
        log('dispatch auth token message received', idToken, accessToken);
        const payload = jwt.decode(idToken);
        log('JWT decoded result = ', payload);
        if (state === `req-${this._seq}` && payload.nonce && payload.nonce === this._nonce) {
          log('accepting received auth tokens');
          this._cleanup();
          resolve({ idToken, accessToken });
        } else {
          log('received auth tokens are NOT for this device. Ignore.', payload, this._nonce, state, this._seq);
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
