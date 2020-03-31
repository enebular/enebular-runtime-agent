/* @flow */
import fetch from 'isomorphic-fetch'
import crypto from 'crypto'
import { execSync } from 'child_process'
import request from 'request'
import progress from 'request-progress'
import fs from 'fs'
import util from 'util'
import { spawn } from 'child_process'

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

export async function progressRequest(url, path, obj) {
  const that = obj

  const onProgress = state => {
    that._info(
      util.format(
        'Download progress: %f%% @ %fKB/s, %fsec',
        state.percent ? Math.round(state.percent * 100) : 0,
        state.speed ? Math.round(state.speed / 1024) : 0,
        state.time.elapsed ? Math.round(state.time.elapsed) : 0
      )
    )
  }

  await new Promise(function(resolve, reject) {
    const fileStream = fs.createWriteStream(path)
    fileStream.on('error', err => {
      reject(err)
    })
    progress(request(url), {
      delay: 5000,
      throttle: 5000
    })
      .on('response', response => {
        that._debug(
          `Response: ${response.statusCode}: ${response.statusMessage}`
        )
        if (response.statusCode >= 400) {
          reject(
            new Error(
              `Error response: ${response.statusCode}: ${
                response.statusMessage
              }`
            )
          )
        }
      })
      .on('progress', onProgress)
      .on('error', err => {
        reject(err)
      })
      .on('end', () => {
        resolve()
      })
      .pipe(fileStream)
  })
}

export async function execSpawn(args, env, cwd, path, maxTime, obj) {

  const that = obj

  await new Promise((resolve, reject) => {
    const cproc = spawn(path, args, {
      stdio: 'pipe',
      env: env,
      cwd: cwd
    })
    const timeoutID = setTimeout(() => {
      that._info('Execution went over time limit')
      cproc.kill()
    }, maxTime * 1000)
    cproc.stdout.on('data', data => {
      let str = data.toString().replace(/(\n|\r)+$/, '')
      that._info('Output: ' + str)
    })
    cproc.stderr.on('data', data => {
      let str = data.toString().replace(/(\n|\r)+$/, '')
      that._info('Output: ' + str)
    })
    cproc.on('error', err => {
      clearTimeout(timeoutID)
      reject(err)
    })
    cproc.once('exit', (code, signal) => {
      clearTimeout(timeoutID)
      if (code !== null) {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error('Execution ended with failure exit code: ' + code))
        }
      } else {
        reject(new Error('Execution ended with signal: ' + signal))
      }
    })
  })

}
