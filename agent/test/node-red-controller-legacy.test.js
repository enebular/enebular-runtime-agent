/* @flow */
import test from 'ava'
import fs from 'fs-extra'
import path from 'path'
import { Server } from 'net'
import crypto from 'crypto'

import EnebularAgent from '../src/enebular-agent'
import ConnectorService from '../src/connector-service'
import { decryptCredential } from '../src/utils'
import NodeRedAdminApi from './helpers/node-red-admin-api'
import Utils from './helpers/utils'
import DummyServer from './helpers/dummy-server'
import {
  createUnauthenticatedAgent,
  createConnectedAgent,
  nodeRedIsAlive,
  nodeRedIsDead,
  polling,
  agentCleanup
} from './helpers/agent-helper'

const DummyServerPort = 3004
const NodeRedPort = 4004

let agent: EnebularAgent
let connector: ConnectorService
let server: DummyServer
let http: Server
let tmpNodeRedDataDir: string
let tmpFlowStateFile: string
let tmpLogPath: string

test.before(async t => {
  process.env.ENEBULAR_TEST = true
  process.env.DEBUG = 'info'
  server = new DummyServer()
  http = await server.start(DummyServerPort)
})

test.after(t => {
  http.close()
})

test.afterEach.always('cleanup', async t => {
  await agentCleanup(agent, NodeRedPort)

  if (tmpLogPath) {
    fs.removeSync(tmpLogPath)
    tmpLogPath = null
  }
  if (tmpFlowStateFile) {
    fs.removeSync(tmpFlowStateFile)
    tmpFlowStateFile = null
  }
  if (tmpNodeRedDataDir) {
    fs.removeSync(tmpNodeRedDataDir)
    tmpNodeRedDataDir = null
  }
})

async function createAgentRunningWithTestNodeRedSettings(
  t: test,
  withCredentialSecretFileName: string
) {
  tmpLogPath = '/tmp/tmp-test-log-' + Utils.randomString()
  tmpFlowStateFile = '/tmp/enebular-flow-' + Utils.randomString()
  tmpNodeRedDataDir = '/tmp/.node-red-config-' + Utils.randomString()
  fs.ensureDirSync(tmpNodeRedDataDir)
  fs.copySync(
    path.join(__dirname, '..', '..', 'node-red', '.node-red-config'),
    tmpNodeRedDataDir
  )
  fs.copySync(
    path.join(
      __dirname,
      'data',
      withCredentialSecretFileName || 'node-red-test-settings'
    ),
    tmpNodeRedDataDir + '/settings.js'
  )

  const ret = await createUnauthenticatedAgent(
    t,
    server,
    {
      ENEBULAR_ENABLE_FILE_LOG: true,
      ENEBULAR_LOG_FILE_PATH: tmpLogPath,
      ENEBULAR_FLOW_STATE_PATH: tmpFlowStateFile,
      NODE_RED_DATA_DIR: tmpNodeRedDataDir,
      NODE_RED_COMMAND:
        './node_modules/.bin/node-red -p ' +
        NodeRedPort +
        ' -s ' +
        tmpNodeRedDataDir +
        '/settings.js'
    },
    DummyServerPort
  )
  agent = ret.agent
  connector = ret.connector

  // console.log("user directory: ", agent._nodeRed._getDataDir())
  t.true(await nodeRedIsAlive(NodeRedPort))
}

test.serial(
  'NodeRedControllerLegacy.1: Agent starts/shutdowns node-red correctly',
  async t => {
    const configFile = Utils.createDummyEnebularConfig({}, DummyServerPort)
    const ret = await createConnectedAgent(
      t,
      Utils.addNodeRedPortToConfig(
        { ENEBULAR_CONFIG_PATH: configFile },
        NodeRedPort
      )
    )
    agent = ret.agent

    t.true(await nodeRedIsAlive(NodeRedPort))
    await agent.shutdown()
    t.true(await nodeRedIsDead(NodeRedPort))
  }
)

test.serial(
  'NodeRedControllerLegacy.2: Agent handles deploy message correctly',
  async t => {
    await createAgentRunningWithTestNodeRedSettings(t)

    // update the flow
    const expectedFlowName = 'flow1.json'
    const expectedFlowJson = fs.readFileSync(
      path.join(__dirname, 'data', expectedFlowName),
      'utf8'
    )
    const url =
      'http://127.0.0.1:' +
      DummyServerPort +
      '/test/download-flow?flow=' +
      expectedFlowName
    connector.sendMessage('deploy', {
      downloadUrl: url
    })

    const callback = async () => {
      const api = new NodeRedAdminApi('http://127.0.0.1:' + NodeRedPort)
      const flow = await api.getFlow()
      if (flow) {
        t.truthy(flow)
        const expectedFlow = JSON.parse(expectedFlowJson)
        return Utils.jsonEquals(expectedFlow, flow)
      }
      return false
    }

    // give it 2s to shutdown
    t.true(await polling(callback, 2000, 500, 30000))
  }
)

test.serial(
  'NodeRedControllerLegacy.3: Agent handles update-flow message correctly',
  async t => {
    await createAgentRunningWithTestNodeRedSettings(t)

    // update the flow
    const expectedFlowName = 'flow2.json'
    const expectedFlowJson = fs.readFileSync(
      path.join(__dirname, 'data', expectedFlowName),
      'utf8'
    )
    const url =
      'http://127.0.0.1:' +
      DummyServerPort +
      '/test/download-flow?flow=' +
      expectedFlowName
    connector.sendMessage('update-flow', {
      downloadUrl: url
    })

    const callback = async () => {
      const api = new NodeRedAdminApi('http://127.0.0.1:' + NodeRedPort)
      const flow = await api.getFlow()
      if (flow) {
        t.truthy(flow)
        const expectedFlow = JSON.parse(expectedFlowJson)
        return Utils.jsonEquals(expectedFlow, flow)
      }
      return false
    }

    // give it 2s to shutdown
    t.true(await polling(callback, 2000, 500, 30000))
  }
)

test.serial(
  'NodeRedControllerLegacy.4: Agent handles deploy dependencies correctly',
  async t => {
    await createAgentRunningWithTestNodeRedSettings(t)

    // update the flow
    const expectedFlowName = 'flow1.json'
    const url =
      'http://127.0.0.1:' +
      DummyServerPort +
      '/test/download-flow?dependencies=on&flow=' +
      expectedFlowName
    connector.sendMessage('deploy', {
      downloadUrl: url
    })

    const callback = () => {
      return fs.existsSync(
        tmpNodeRedDataDir + '/node_modules/node-red-node-pi-gpiod'
      )
    }
    t.true(await polling(callback, 0, 500, 30000))
  }
)

test.serial(
  'NodeRedControllerLegacy.5: Agent handles deploy credentials correctly',
  async t => {
    await createAgentRunningWithTestNodeRedSettings(t)

    // update the flow
    const expectedFlowName = 'flow_clear_text_creds.json'
    const url =
      'http://127.0.0.1:' +
      DummyServerPort +
      '/test/download-flow?flow=' +
      expectedFlowName
    connector.sendMessage('deploy', {
      downloadUrl: url
    })

    const flowCredsPath = path.join(
      __dirname,
      'data',
      'creds_of_' + expectedFlowName
    )
    const expectedCredJson = fs.readFileSync(flowCredsPath, 'utf8')
    const expectedCred = JSON.parse(expectedCredJson)
    const callback = () => {
      const credJson = fs.readFileSync(
        tmpNodeRedDataDir + '/flows_cred.json',
        'utf8'
      )
      const cred = JSON.parse(credJson)
      return Utils.jsonEquals(expectedCred, cred)
    }

    t.true(await polling(callback, 0, 500, 30000))
  }
)

test.serial(
  'NodeRedControllerLegacy.6: Agent handles deploy encrypted credentials correctly',
  async t => {
    await createAgentRunningWithTestNodeRedSettings(
      t,
      'node-red-test-settings-with-encryption'
    )

    // update the flow
    const expectedFlowName = 'flow_clear_text_creds.json'
    const url =
      'http://127.0.0.1:' +
      DummyServerPort +
      '/test/download-flow?flow=' +
      expectedFlowName
    connector.sendMessage('deploy', {
      downloadUrl: url
    })
    return new Promise((resolve, reject) => {
      setTimeout(async () => {
        const flowCredsPath = path.join(
          __dirname,
          'data',
          'creds_of_' + expectedFlowName
        )
        const credJson = fs.readFileSync(
          tmpNodeRedDataDir + '/flows_cred.json',
          'utf8'
        )
        const cred = JSON.parse(credJson).$

        const settings = JSON.parse(
          fs.readFileSync(tmpNodeRedDataDir + '/.config.json', 'utf8')
        )
        const decryptKey = settings._credentialSecret
        const decryptCredJson = JSON.parse(decryptCredential(decryptKey, cred))

        const expectedCredJson = fs.readFileSync(flowCredsPath, 'utf8')
        const expectedCred = JSON.parse(expectedCredJson)

        t.deepEqual(decryptCredJson, expectedCred)
        resolve()
      }, 4000)
    })
  }
)

test.serial(
  'NodeRedControllerLegacy.7: Agent requires -dev-mode if flow package contains editSession',
  async t => {
    await createAgentRunningWithTestNodeRedSettings(t)

    // update the flow
    const expectedFlowName = 'flow1.json'
    const expectedFlowJson = fs.readFileSync(
      path.join(__dirname, 'data', expectedFlowName),
      'utf8'
    )
    const url =
      'http://127.0.0.1:' +
      DummyServerPort +
      '/test/download-flow?edit=on&flow=' +
      expectedFlowName
    connector.sendMessage('deploy', {
      downloadUrl: url
    })

    const callback = async () => {
      const log = fs.readFileSync(tmpLogPath, 'utf8')
      return log.includes('Start agent in --dev-mode to allow edit session')
    }

    // give it 2s to shutdown
    t.true(await polling(callback, 2000, 500, 10000))
  }
)

test.serial(
  'NodeRedControllerLegacy.8: Agent handles deploy failure (flow downloading fail)',
  async t => {
    await createAgentRunningWithTestNodeRedSettings(t)

    // update the flow
    const expectedFlowName = 'flow1.json'
    const expectedFlowJson = fs.readFileSync(
      path.join(__dirname, 'data', expectedFlowName),
      'utf8'
    )
    const url =
      'http://127.0.0.1:' +
      DummyServerPort +
      '/test/wrong-flow?flow=' +
      expectedFlowName
    connector.sendMessage('deploy', {
      downloadUrl: url
    })

    const callback = async () => {
      const log = fs.readFileSync(tmpLogPath, 'utf8')
      return log.includes('Update flow failed: Failed response')
    }

    // give it 2s to shutdown
    t.true(await polling(callback, 2000, 500, 10000))
  }
)

/*
test.serial(
  'NodeRedControllerLegacy.8: Agent accepts flow credentials correctly if secret is specified',
  async t => {
    await createAgentRunningWithTestNodeRedSettings(t, 'node-red-test-settings-with-credential-secret')

    let credsCheckReceived = false
    const credsCheckCallback = (login, password) => {
      t.is(login, 'username')
      t.is(password, 'abcdef')
      credsCheckReceived = true
    }
    server.on('credsCheck', credsCheckCallback)

    // update the flow
    const expectedFlowName = 'flow_encrypted_creds.json'
    const url =
      'http://127.0.0.1:' +
      DummyServerPort +
      '/test/download-flow?flow=' +
      expectedFlowName
    connector.sendMessage('deploy', {
      downloadUrl: url
    })
    return new Promise((resolve, reject) => {
      setTimeout(async () => {
        t.true(credsCheckReceived)
        server.removeListener('credsCheck', credsCheckCallback)
        resolve()
      }, 4000)
    })
  }
)

test.serial(
  'NodeRedControllerLegacy.9: Agent fails to recover flow credentials without secret',
  async t => {
    await createAgentRunningWithTestNodeRedSettings(t)

    let credsCheckReceived = false
    const credsCheckCallback = (login, password) => {
      t.is(login, '')
      t.is(password, '')
      credsCheckReceived = true
    }
    server.on('credsCheck', credsCheckCallback)

    // update the flow
    const expectedFlowName = 'flow_encrypted_creds.json'
    const url =
      'http://127.0.0.1:' +
      DummyServerPort +
      '/test/download-flow?flow=' +
      expectedFlowName
    connector.sendMessage('deploy', {
      downloadUrl: url
    })
    return new Promise((resolve, reject) => {
      setTimeout(async () => {
        t.true(credsCheckReceived)
        server.removeListener('credsCheck', credsCheckCallback)
        resolve()
      }, 4000)
    })
  }
)

test.serial(
  'NodeRedControllerLegacy.10: Agent accepts clear text flow credentials correctly',
  async t => {
    await createAgentRunningWithTestNodeRedSettings(t)

    let credsCheckReceived = false
    const credsCheckCallback = (login, password) => {
      t.is(login, 'username')
      t.is(password, 'abcdef')
      credsCheckReceived = true
    }
    server.on('credsCheck', credsCheckCallback)

    // update the flow
    const expectedFlowName = 'flow_clear_text_creds.json'
    const url =
      'http://127.0.0.1:' +
      DummyServerPort +
      '/test/download-flow?flow=' +
      expectedFlowName
    connector.sendMessage('deploy', {
      downloadUrl: url
    })
    return new Promise((resolve, reject) => {
      setTimeout(async () => {
        t.true(credsCheckReceived)
        server.removeListener('credsCheck', credsCheckCallback)
        resolve()
      }, 4000)
    })
  }
)
*/
