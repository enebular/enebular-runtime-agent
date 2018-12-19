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

  if (tmpNodeRedDataDir) {
    fs.removeSync(tmpNodeRedDataDir)
    tmpNodeRedDataDir = null
  }
})

async function createAgentRunningWithTestNodeRedSettings(
  t: test,
  withCredentialSecretFileName: string
) {
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
      withCredentialSecretFileName
        ? withCredentialSecretFileName
        : 'node-red-test-settings'
    ),
    tmpNodeRedDataDir + '/settings.js'
  )

  const ret = await createUnauthenticatedAgent(
    t,
    server,
    {
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
  'NodeRedController.1: Agent starts/shutdowns node-red correctly',
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
  'NodeRedController.2: Agent restarts node-red correctly',
  async t => {
    const data = fs.readFileSync(
      path.join(__dirname, 'data', 'flow1.json'),
      'utf8'
    )
    let flowFileName = '/tmp/.enebular-flow-' + Utils.randomString() + '.json'
    fs.writeFileSync(flowFileName, data)

    const ret = await createConnectedAgent(t, {
      NODE_RED_COMMAND:
        './node_modules/.bin/node-red -p ' + NodeRedPort + ' ' + flowFileName
    })
    agent = ret.agent

    t.true(await nodeRedIsAlive(NodeRedPort))
    // update the flow
    const expectedFlowJson = fs.readFileSync(
      path.join(__dirname, 'data', 'flow2.json'),
      'utf8'
    )
    fs.writeFileSync(flowFileName, expectedFlowJson)

    ret.connector.sendMessage('restart')

    const callback = async () => {
      const api = new NodeRedAdminApi('http://127.0.0.1:' + NodeRedPort)
      const flow = await api.getFlow()
      if (flow) {
        t.truthy(flow)
        const expectedFlow = JSON.parse(expectedFlowJson)
        t.deepEqual(expectedFlow, flow)
        return true
      }
      return false
    }
    t.true(await polling(callback, 0, 500, 30000))
  }
)

test.serial(
  'NodeRedController.3: Agent handles deploy message correctly',
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
  'NodeRedController.4: Agent handles update-flow message correctly',
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
  'NodeRedController.5: Agent handles shutdown/start message correctly',
  async t => {
    await createAgentRunningWithTestNodeRedSettings(t)

    connector.sendMessage('shutdown')
    t.true(await nodeRedIsDead(NodeRedPort))
    connector.sendMessage('start')
    t.true(await nodeRedIsAlive(NodeRedPort))
  }
)

test.serial(
  'NodeRedController.6: Agent handles deploy dependencies correctly',
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
  'NodeRedController.7: Agent handles deploy credentials correctly',
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
  'NodeRedController.8: Agent handles deploy encrypted credentials correctly',
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

/*
test.serial(
  'NodeRedController.8: Agent accepts flow credentials correctly if secret is specified',
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
  'NodeRedController.9: Agent fails to recover flow credentials without secret',
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
  'NodeRedController.10: Agent accepts clear text flow credentials correctly',
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
