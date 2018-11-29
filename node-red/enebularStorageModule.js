const axios = require('axios')
const fs = require('fs')
const path = require('path')
const RED = require('@uhuru/enebular-node-red')

const ENEBULAR_EDITOR_URL =
  process.env.ENEBULAR_EDITOR_URL || 'http://localhost:9017'

const SESSION_TOKEN = process.env.ENEBULAR_EDITOR_SESSION_TOKEN

function getLibraryEntry(type, path) {
  return new Promise((resolve, reject) => resolve([]))
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
          resolve(JSON.parse(data))
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
  return new Promise((resolve, reject) => resolve({}))
}

function saveSettings(settings) {
  return new Promise((resolve, reject) => resolve())
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
