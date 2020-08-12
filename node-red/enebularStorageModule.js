const axios = require('axios')
const fs = require('fs-extra')
const path = require('path')
const crypto = require('crypto')
const RED = require('@uhuru/enebular-node-red')

const ENEBULAR_EDITOR_URL =
  process.env.ENEBULAR_EDITOR_URL || 'http://localhost:9017'

const SESSION_TOKEN = process.env.ENEBULAR_EDITOR_SESSION_TOKEN

function getLibraryEntry(type, path) {
  return new Promise((resolve, reject) => resolve([]))
}

function decryptCredential(key, credential) {
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

function loadConfig(fileName) {
  return new Promise(function(resolve, reject) {
    const userdir = path.resolve(__dirname, '.node-red-config')
    fs.readFile(path.join(userdir, fileName), 'utf8', function(err, data) {
      if (err) {
        reject(err)
      } else {
        if (!data) {
          resolve({})
        } else {
          let result = JSON.parse(data)
          if (fileName === 'flows_cred.json' && result.$) {
            const dotconfig = fs.readFileSync(
              path.join(userdir, '.config.json'),
              'utf8'
            )
            const key = JSON.parse(dotconfig)._credentialSecret
            result = JSON.parse(decryptCredential(key, result.$))
          }
          resolve(result)
        }
      }
    })
  })
}

function getPackages(flows) {
  var nodeList = RED.nodes.getNodeList()
  var types = nodeList.reduce((types, node) => {
    ;(node.types || []).forEach(type => {
      types[type] = [node.module, node.version]
    })
    return types
  }, {})
  return flows.reduce((packages, node) => {
    var modVer = types[node.type]
    if (modVer) {
      var module = modVer[0]
      var version = modVer[1]
      if (module !== 'node-red' && module !== 'node-red-node-aws-lambda-io') {
        packages[module] = version
      }
    }
    return packages
  }, {})
}

function getSettings() {
    const userdir = path.resolve(__dirname, '.node-red-config')
    const globalSettingsFile = path.join(userdir, '.config.json')
    
    return fs.readJson(globalSettingsFile, 'utf8').catch((err) => {
      if (err.code != 'ENOENT') {
        throw err
      }
      return {}
    })
}

function saveSettings(settings) {
  const userdir = path.resolve(__dirname, '.node-red-config')
  const globalSettingsFile = path.join(userdir, '.config.json')

  return  fs.writeJson(globalSettingsFile, settings, { replacer: null, spaces: 2})
}

function mapNodeTypes(flows, credentials) {
  // extract credential type from flows
  for (let props in credentials) {
    for (let i = 0; i < flows.length; i++) {
      const item = flows[i]
      if (item.id === props) {
        credentials[props].type = item.type
        break
      }
    }
  }
  return credentials
}

function saveEnebularFlow(params) {
  const saveFlowUrl = `${ENEBULAR_EDITOR_URL}/api/v1/agent-editor/flow`
  return new Promise((resolve, reject) => {
    return axios
      .post(saveFlowUrl, params, {
        headers: {
          'x-ee-session': SESSION_TOKEN
        }
      })
      .then(response => {
        resolve()
      })
      .catch(err => {
        reject(err)
      })
  })
}

function saveFlows(flows, credentials, screenshot) {
  let credentialIds = []
  if (credentials.$) {
    const userdir = path.resolve(__dirname, '.node-red-config')
    const dotconfig = fs.readFileSync(
      path.join(userdir, '.config.json'),
      'utf8'
    )
    const key = JSON.parse(dotconfig)._credentialSecret
    credentials = JSON.parse(decryptCredential(key, credentials.$))
  }

  if (credentials) {
    credentialIds = credentialIds.concat(Object.keys(credentials))
  }
  return saveEnebularFlow({
    flow: flows,
    packages: getPackages(flows),
    credentialIds: credentialIds,
    screenshot: screenshot
  })
}

function saveCredentials(credentials, flows) {
  const saveCredUrl = `${ENEBULAR_EDITOR_URL}/api/v1/agent-editor/credential`
  if (credentials.$) {
    const userdir = path.resolve(__dirname, '.node-red-config')
    const dotconfig = fs.readFileSync(
      path.join(userdir, '.config.json'),
      'utf8'
    )
    const key = JSON.parse(dotconfig)._credentialSecret
    credentials = JSON.parse(decryptCredential(key, credentials.$))
  }
  return new Promise((resolve, reject) => {
    return axios
      .post(saveCredUrl, [credentials, flows], {
        headers: {
          'x-ee-session': SESSION_TOKEN
        }
      })
      .then(response => {
        resolve()
      })
      .catch(err => {
        console.error('axios err', err)
        reject(err)
      })
  })
}

module.exports = {
  init: function(_settings) {
    settings = _settings
    return settings
  },
  mapNodeTypes: function(flows, credentials) {
    return mapNodeTypes(flows, credentials)
  },
  getFlows: function() {
    return loadConfig('flows.json')
  },
  getCredentials: function() {
    return loadConfig('flows_cred.json')
  },
  getLibraryEntry: function(type, path) {
    return getLibraryEntry(type, path)
  },
  saveFlows: function(flows, credentials, screenshot) {
    return saveFlows(flows, credentials, screenshot)
  },
  saveCredentials: function(credentials, flows) {
    return saveCredentials(credentials, flows)
  },
  getSettings: function() {
    return getSettings()
  },
  saveSettings: function(data) {
    return saveSettings(data)
  }
}
