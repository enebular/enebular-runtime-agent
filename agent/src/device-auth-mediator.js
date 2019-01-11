/* @flow */
import EventEmitter from 'events'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { postJSON } from './utils'
import type { Logger } from 'winston'

/**
 * Events emitted (for external use):
 *  - accessTokenUpdate (accessToken)
 *  - accessTokenClear
 */

const moduleName = 'device-auth'

const AUTH_TOKEN_TIMEOUT = 10000

export default class DeviceAuthMediator extends EventEmitter {
  _log: Logger
  _requestUrl: string
  _connectionId: string
  _deviceId: string
  _attemptingAuth: boolean
  _requestingAuth: boolean = false
  _requestRetryID: ?number
  _requestRetryTime: number = 0
  _nonce: ?string
  _seq: number = 0
  _tokenEmitter: EventEmitter

  constructor(messageEmitter: EventEmitter, log: Logger) {
    super()
    this._log = log
    messageEmitter.on('updateAuth', message => this._handleUpdateAuth(message))
    this._tokenEmitter = new EventEmitter()
  }

  debug(msg: string, ...args: Array<mixed>) {
    args.push({ module: moduleName })
    this._log.debug(msg, ...args)
  }

  info(msg: string, ...args: Array<mixed>) {
    args.push({ module: moduleName })
    this._log.info(msg, ...args)
  }

  _handleUpdateAuth({ idToken, accessToken, state }) {
    if (idToken === '-' && accessToken === '-' && state === '-') {
      this.debug('updateAuth:authRequestTrigger command received')
      this.startAuthAttempt()
    } else {
      this.debug('updateAuth:tokenUpdate command received')
      if (this._requestingAuth) {
        const payload = jwt.decode(idToken)
        this.debug('ID token:', payload)
        if (
          state === `req-${this._seq}` &&
          payload &&
          payload.nonce &&
          payload.nonce === this._nonce
        ) {
          this.debug('Accepting tokens')
          this._tokenEmitter.emit('tokenUpdate')
          if (accessToken === '-') {
            this.debug('accessToken cleared')
            this.emit('accessTokenClear')
          } else {
            this.debug('accessToken provided')
            this.emit('accessTokenUpdate', accessToken)
          }
        } else {
          this.debug(
            'Tokens are not for this device - ignoring',
            payload,
            this._nonce,
            state,
            this._seq
          )
        }
      } else {
        this.debug("Wasn't requesting auth so ignoring updateAuth command")
      }
    }
  }

  async _requestAuthWithRetry() {
    this.debug('Requesting authentication...')
    try {
      await this._requestAuth()
      this._requestAuthCleanup()
      this.endAuthAttempt()
    } catch (err) {
      this._requestAuthCleanup()
      this.debug('Auth failed:', err.message)
      this.emit('authFailed')
      if (this._attemptingAuth) {
        this._requestRetryTime =
          this._requestRetryTime === 0 ? 15 * 1000 : this._requestRetryTime * 2
        this._requestRetryTime = Math.min(
          this._requestRetryTime,
          4 * 60 * 60 * 1000
        )
        this.debug(
          `Retrying authentication (in ${this._requestRetryTime / 1000}sec)...`
        )
        this._requestRetryID = setTimeout(() => {
          this._requestAuthWithRetry()
        }, this._requestRetryTime)
      }
    }
  }

  async _requestAuth() {
    if (this._requestingAuth) {
      throw new Error('Already requesting auth')
    }
    if (!this._requestUrl || !this._connectionId || !this._deviceId) {
      throw new Error('Auth request parameters are not yet configured')
    }
    this._requestingAuth = true
    const nonce = crypto.randomBytes(16).toString('hex')
    this._nonce = nonce
    this._seq++
    const state = `req-${this._seq}`
    const waitTokens = this._waitForTokenUpdate()
    waitTokens.catch(err => {
      this.debug('Auth request: ' + err.message)
    })

    try {
      await postJSON(
        this._requestUrl,
        JSON.stringify({
          connectionId: this._connectionId,
          deviceId: this._deviceId,
          nonce,
          state
        })
      )
    } catch (err) {
      this.debug('Auth request failed: ' + err.message)
    }
    await waitTokens
  }

  async _waitForTokenUpdate() {
    this.debug('Setting up wait for token update...')
    return new Promise((resolve, reject) => {
      this._tokenEmitter.on('tokenUpdate', accessToken => {
        resolve()
      })
      setTimeout(() => {
        reject(new Error('Tokens did not arrive'))
      }, AUTH_TOKEN_TIMEOUT)
    })
  }

  _requestAuthCleanup() {
    this._requestingAuth = false
    this._nonce = null
    this._tokenEmitter.removeAllListeners('tokenUpdate')
  }

  endAuthAttempt() {
    if (this._attemptingAuth) {
      this.info('Ending authentication')
      if (this._requestRetryID) {
        clearTimeout(this._requestRetryID)
        this._requestRetryID = null
      }
      this._requestRetryTime = 0
      this._nonce = null
      this._requestingAuth = false
      this._attemptingAuth = false
    }
  }

  startAuthAttempt() {
    this.info('Starting authentication...')
    /* if it's already active, just reset the retry time */
    this._requestRetryTime = 0
    if (!this._attemptingAuth) {
      this._requestAuthWithRetry()
      this._attemptingAuth = true
    }
  }

  setAuthRequestParameters(
    authRequestUrl: string,
    connectionId: string,
    deviceId: string
  ) {
    this._requestUrl = authRequestUrl
    this._connectionId = connectionId
    this._deviceId = deviceId
  }
}
