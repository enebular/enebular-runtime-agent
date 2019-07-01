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

export async function createNodeDefinition(nodes, aiNodeDir) {
  let htmlFile = `<script type="text/javascript">RED.nodes.registerType('enebular-ai-node',
  {
    category: 'function',
    color: '#F0F0F0 ',
    defaults: {
      name: {
        value:''
      },
      aiModel: {
        value: '',
        required: true
      },
      handlerFunc: {
        value:'',
        required: true
      }
    },
    inputs: 1,
    outputs: 1,
    icon: 'ai-node.png',
    label: function() {
      return this.name||'enebular AI node'
    },
    paletteLabel: 'enebular AI node', 
    labelStyle: function () {
      return this.name ? 'node_label_italic' : '';
    },
    oneditprepare: function () {
      $("#node-input-aiModel").change(function () {
        var id = $("#node-input-aiModel option:selected").val();
        if (id) {
          $(".input-handlerFunc").show();
          $("#select-handlerFunc option").remove();
          var config = $("#ai-config").val();
          config = JSON.parse(config);
          var aiModel = config[id];
          $("<option disabled></option>").val('').text('select handler function').appendTo("#select-handlerFunc");
          var already = $("#node-input-handlerFunc").val()
          var exist = false
          aiModel.handlers.forEach(handler => {
            $("<option></option>").val(handler.id).text(handler.title).appendTo("#select-handlerFunc");
            if (already === handler.id) {
              exist = true
              if (handler.description) {
                $(".div-handlerDesc").show();
                $('<div id="text-description"></div>').text(handler.description).appendTo(".div-handlerDesc")
              } else {
                $(".div-handlerDesc").hide();
              }
            }
          });
          if (exist) {
            $("#select-handlerFunc").val(already)           
          } else {
            $("#select-handlerFunc").val('')
            $("#node-input-handlerFunc").val('')
            $(".div-handlerDesc").hide();
          }
        }
      });
      $("#select-handlerFunc").change(function () {
        var id = $("#select-handlerFunc option:selected").val();
        $("#node-input-handlerFunc").val(id)
        var config = $("#ai-config").val();
        config = JSON.parse(config);
        var modelId = $("#node-input-aiModel option:selected").val();
        var aiModel = config[modelId];
        var handler = aiModel.handlers.find(handler => handler.id === id)
        if (handler.description) {
          $(".div-handlerDesc").show();
          $("#text-description").remove()
          $('<div id="text-description"></div>').text(handler.description).appendTo(".div-handlerDesc")
        } else {
          $(".div-handlerDesc").hide();
        }
      })
    }
  });
  </script>
  <script type="text/x-red" data-template-name="enebular-ai-node">
    <div class="form-row">
    <label for="node-input-aiModel"><i class="fa fa-wrench"></i> AI Model</label>
    <select type="text" id="node-input-aiModel"><option value="" disabled>select AI Model</option>`
  Object.keys(nodes).forEach(nodeId => {
    htmlFile += `<option value="${nodeId}">${nodes[nodeId].title}</option>`
  })
  htmlFile += `
    </select>
    <input type="hidden" id="ai-config" value='${JSON.stringify(nodes)}' />
  </div>
  <div class="form-row input-handlerFunc hidden">
    <label for="select-handlerFunc"><i class="fa fa-wrench"></i> Handler Function</label>
    <select type="text" id="select-handlerFunc">  
    </select>
    <input type="hidden" id="node-input-handlerFunc" />
  </div>
  <div class="form-row div-handlerDesc hidden">
  <label for="text-handlerFunc"><i class="fa fa-info"></i> Description</label></div>
  </script>  
  <script type="text/x-red"
  data-help-name="enebular-ai-node"><p>enebular AI node to work with enebular AI models<br/></p></script>`
  await fsWriteFileAsync(
    path.resolve(aiNodeDir, 'nodes', `enebular-ai-node.html`),
    htmlFile
  )

  const jsFile = `
module.exports = function(RED) {
  var request = require('request')

  var endpointConfig = ${JSON.stringify(nodes)} 

  function main(config) {
    RED.nodes.createNode(this, config)
    var node = this
    var aiModel = config.aiModel
    var handlerId = config.handlerFunc  
    if(!endpointConfig) { 
       node.status({
        fill: 'red',
        shape: 'ring',
        text: 'no config'
      })
      return
    }
    
    this.on('input', function(msg) {
      var preRequestTimestamp = process.hrtime()
      node.status({
        fill: 'blue',
        shape: 'dot',
        text: 'requesting'
      })
      if (!aiModel) {
        node.status({
          fill: 'red',
          shape: 'ring',
          text: 'no ai model'
        })
        node.error('Please select AI Model', msg)          
        return
      }
      if (!handlerId) {
        node.status({
          fill: 'red',
          shape: 'ring',
          text: 'no handler function'
        })
        node.error('Please select handler function', msg)          
        return
      }
      if(!endpointConfig[aiModel].endpoint) {
        node.error('No endpoint data for this AI Model. Please make sure that this AI Model is deployed and running and redepoy the flow.', msg)
        node.status({
          fill: 'red',
          shape: 'ring',
          text: 'no endpoint'
        })
        return
      }
      var nodeUrl = 'http://' + endpointConfig[aiModel].endpoint + '/' + handlerId
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
  RED.nodes.registerType('enebular-ai-node', main)
}`
  await fsWriteFileAsync(
    path.resolve(aiNodeDir, 'nodes', `enebular-ai-node.js`),
    jsFile
  )
}
