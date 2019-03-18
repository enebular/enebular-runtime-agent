/* @flow */
import fetch from 'isomorphic-fetch'
import crypto from 'crypto'
import path from 'path'
import fs from 'fs'
import { promisify } from 'util'

export const fsWriteFileAsync = promisify(fs.writeFile)
export const fsReadFileAsync = promisify(fs.readFile)
export const fsCopyFileAsync = promisify(fs.copyFile)
export const fsMkdirAsync = promisify(fs.mkdir)
export const fsUnlinkAsync = promisify(fs.unlink)
export const fsSymlinkAsync = promisify(fs.symlink)

export const mkdirpAsync = async dirPath => {
  const parts = dirPath.split(path.sep)
  for (let i = 1; i <= parts.length; i++) {
    await mkdirAsync(path.join.apply(null, parts.slice(0, i)))
  }
}

export const mkdirAsync = async dirPath => {
  return fsMkdirAsync(dirPath).catch(err => {
    if (err.code !== 'EEXIST') {
      throw err
    }
  })
}

export const unlinkAsync = async filePath => {
  return fsUnlinkAsync(filePath).catch(err => {
    if (err.code !== 'ENOENT') {
      throw err
    }
  })
}

export const symlinkAsync = async (target, path, type) => {
  return fsSymlinkAsync(target, path, type).catch(err => {
    if (err.code !== 'EEXIST') {
      throw err
    }
  })
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

export async function createNodeDefinition(node, aiNodeDir) {
  const htmlFile = `<script type="text/javascript">RED.nodes.registerType('${
    node.id
  }',{category:'Enebular AI',color:'#F0F0F0 ',defaults:{name:{value:''},handlerFunc:{value:'${
    node.handlerFunc
  }'},enebularAi:{value:true},modelId:{value:'${
    node.assetId
  }'},url:{value:''}},inputs:1,outputs:1,icon:'icon.svg',label:function(){return this.name||'${
    node.nodeTitle
  }'},paletteLabel:'${
    node.nodeTitle
  }'});</script><script type="text/x-red" data-template-name="${
    node.id
  }"><div class="form-row"><label for="node-input-name"><i class="icon-tag"></i>Name</label><input type="text" id="node-input-name" placeholder="Name"><label for="node-input-url"><i class="icon-tag"></i>URL</label><input type="text" id="node-input-url"></div></script><script type="text/x-red" data-help-name="${
    node.id
  }"><p>${node.nodeDesc}<br/></p></script>`
  await fsWriteFileAsync(
    path.resolve(aiNodeDir, 'nodes', `${node.id}.html`),
    htmlFile
  )

  const jsFile = `var request = require('request')

module.exports = function(RED) {
  function main(config) {
    RED.nodes.createNode(this, config)
    var node = this
    var nodeUrl = config.url
    this.on('input', function(msg) {
      var preRequestTimestamp = process.hrtime()
      node.status({
        fill: 'blue',
        shape: 'dot',
        text: 'requesting'
      })
      if (!nodeUrl) {
        node.error('no url', msg)
        node.status({
          fill: 'red',
          shape: 'ring',
          text: 'no url'
        })
        return
      }
      var options = {
        method: 'POST',
        url: nodeUrl,
        timeout: 120000
      }
      if (msg.payload) {
        if (typeof msg.payload === 'string' || Buffer.isBuffer(msg.payload)) {
          options.body = msg.payload
        } else if (typeof msg.payload === 'number') {
          options.body = msg.payload + ''
        } else {
          options.body = JSON.stringify(msg.payload)
          if (options.headers['content-type'] == null) {
            options.headers['content-type'] = 'application/json'
          }
        }
      }

      request(options, function(error, response, body) {
        node.status({})
        if (error) {
          if (error.code === 'ETIMEDOUT') {
            node.error('no response', msg)
            setTimeout(function() {
              node.status({
                fill: 'red',
                shape: 'ring',
                text: 'no response'
              })
            }, 10)
          } else {
            node.error(error, msg)
            msg.payload = error.toString() + ' : ' + nodeUrl
            msg.statusCode = error.code
            node.send(msg)
            node.status({
              fill: 'red',
              shape: 'ring',
              text: error.code
            })
          }
        } else {
          msg.payload = body
          msg.headers = response.headers
          msg.statusCode = response.statusCode
          if (node.metric()) {
            // Calculate request time
            var diff = process.hrtime(preRequestTimestamp)
            var ms = diff[0] * 1e3 + diff[1] * 1e-6
            var metricRequestDurationMillis = ms.toFixed(3)
            node.metric('duration.millis', msg, metricRequestDurationMillis)
            if (response.connection && response.connection.bytesRead) {
              node.metric('size.bytes', msg, response.connection.bytesRead)
            }
          }

          msg.payload = msg.payload.toString('utf8') // txt

          if (node.ret === 'obj') {
            try {
              msg.payload = JSON.parse(msg.payload)
            } catch (e) {
              // obj
              node.warn('JSON error')
            }
          }

          node.send(msg)
        }
      })
    })
  }
  RED.nodes.registerType('${node.id}', main)
}`
  await fsWriteFileAsync(
    path.resolve(aiNodeDir, 'nodes', `${node.id}.js`),
    jsFile
  )
}
