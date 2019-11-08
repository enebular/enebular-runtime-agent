/* @flow */
import fetch from 'isomorphic-fetch'
import crypto from 'crypto'
import { execSync } from 'child_process'

export interface UserInfo {
  user: string,
  gid: number,
  uid: number
}

export async function delay(msec: number) {
  return new Promise(resolve => {
    setTimeout(() => resolve(), msec)
  })
}

/**
 * HTTP request with JSON response
 *
 * This makes a HTTP request with a JSON response and provides
 * consistent error handling of that response.
 *
 * @param  {string} url     Fetch URL
 * @param  {Object} options Fetch options
 * @return {Object}         The fetched JSON
 */
export async function fetchJSON(url, options) {
  options = Object.assign({}, options)
  options.headers = Object.assign(options.headers || {}, {
    Accept: 'application/json'
  })

  const res = await fetch(url, options)
  if (!res.ok) {
    let msg = `Failed response (${res.status} ${res.statusText})`
    let details
    try {
      const resJson = await res.json()
      details = resJson.message ? resJson.message : JSON.stringify(resJson)
    } catch (err) {
      details = 'No error details available'
    }
    msg += ' - ' + details
    throw new Error(msg)
  }

  try {
    const resJson = await res.json()
    return resJson
  } catch (err) {
    throw new Error('Response did not contain JSON')
  }
}

/**
 * HTTP request with JSON body and response
 *
 * This makes a HTTP POST request with both a JSON body and response, and
 * provides consistent error handling of that response.
 *
 * @param  {string} url     Request URL
 * @param  {Object} body    Request body
 * @param  {Object} options Request options
 * @return {Object}         The fetched JSON
 */
export async function postJSON(url, body, options) {
  options = Object.assign({}, options)
  options.method = 'POST'
  options.body = body
  options.headers = Object.assign(options.headers || {}, {
    'Content-Type': 'application/json'
  })

  return fetchJSON(url, options)
}

/**
 * Encrypt Node-RED Node credentials
 *
 * @param  {string} userKey      Request encrypt key
 * @param  {string} credentials  Request credentials
 * @return {string}              encrypt credential
 */
export function encryptCredential(userKey, credentials) {
  const encryptionKey = crypto
    .createHash('sha256')
    .update(userKey)
    .digest()
  const initVector = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-ctr', encryptionKey, initVector)
  const result =
    cipher.update(JSON.stringify(credentials), 'utf8', 'base64') +
    cipher.final('base64')
  return initVector.toString('hex') + result
}

/**
 * Decrypt Node-RED Node credentials
 *
 * @param  {string} key          Request decrypt key
 * @param  {string} credential   Request encrypted credential
 * @return {string}              decrypted credential
 */
export function decryptCredential(key, credential) {
  const encryptionKey = crypto
    .createHash('sha256')
    .update(key)
    .digest()
  const initVector = new Buffer(credential.substring(0, 32), 'hex')
  const encryptedCredentials = credential.substring(32)
  const decipher = crypto.createDecipheriv(
    'aes-256-ctr',
    encryptionKey,
    initVector
  )
  const decrypted =
    decipher.update(encryptedCredentials, 'base64', 'utf8') +
    decipher.final('utf8')
  return decrypted
}

export function execReturnStdout(cmd: string): string | undefined {
  try {
    return execSync(cmd).toString()
  } catch (err) {
    return undefined
  }
}

export function exec(cmd: string): boolean {
  return execReturnStdout(cmd) == undefined ? false : true
}

export function getUserInfo(user: string): UserInfo {
  let ret = execReturnStdout(`id -u ${user}`)
  if (!ret) {
    throw new Error(`Failed to get uid of user ${user}`)
  }
  const uid = parseInt(ret)
  ret = execReturnStdout(`id -g ${user}`)
  if (!ret) {
    throw new Error(`Failed to get gid of user ${user}`)
  }
  const gid = parseInt(ret)
  return {
    user: user,
    gid: gid,
    uid: uid
  }
}

export function getUserHome(user: string): string {
  const getentResult = execReturnStdout(`getent passwd ${user}`)
  if (!getentResult) {
    throw new Error(`Failed to get home directory of user ${user}`)
  }
  return getentResult.split(':')[5]
}

