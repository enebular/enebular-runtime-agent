/* @flow */
import test from 'ava'
import fs from 'fs-extra'
import path from 'path'
import { Server } from 'net'
import crypto from 'crypto'
import objectPath from 'object-path'

import EnebularAgent from '../src/enebular-agent'
import ConnectorService from '../src/connector-service'
import { decryptCredential } from '../src/utils'
import NodeRedAdminApi from './helpers/node-red-admin-api'
import DummyCtrlMsgHandler from './helpers/dummy-ctrl-msg-handler'
import Utils from './helpers/utils'
import DummyServer from './helpers/dummy-server'
import {
  createUnauthenticatedAgent,
  createAuthenticatedAgent,
  createConnectedAgent,
  nodeRedIsAlive,
  nodeRedIsDead,
  polling,
  agentCleanup
} from './helpers/agent-helper'

const DummyServerPort = 3011
const NodeRedPort = 4011

let agent: EnebularAgent
let connector: ConnectorService
let server: DummyServer
let http: Server
let tmpNodeRedDataDir: string

test.before(async t => {
  process.env.ENEBULAR_TEST = true
  process.env.DEBUG = 'debug'
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
  ctrlMsgCallback,
  agentConfig
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
      'node-red-test-settings'
    ),
    tmpNodeRedDataDir + '/settings.js'
  )

  let config = {
    NODE_RED_DATA_DIR: tmpNodeRedDataDir,
    NODE_RED_COMMAND:
      './node_modules/.bin/node-red -p ' +
      NodeRedPort +
      ' -s ' +
      tmpNodeRedDataDir +
      '/settings.js'
  }

  if (agentConfig) {
    config = Object.assign(config, agentConfig)
  }

  const ret = await createAuthenticatedAgent(
    t,
    server,
    config,
    DummyServerPort,
    ctrlMsgCallback
  )
  agent = ret.agent
  connector = ret.connector

  // console.log("user directory: ", agent._nodeRed._getDataDir())
}

async function createAgentRunningWithDeployedFlow(
  t: test,
  flowName: string
) {
    const expectedFlowName = flowName
    const expectedFlowJson = fs.readFileSync(
      path.join(__dirname, 'data', expectedFlowName),
      'utf8'
    )
    const url =
      'http://127.0.0.1:' +
      DummyServerPort +
      '/test/download-flow?flow=' +
      expectedFlowName

    const assetId = Utils.randomString()
    const updateId = Utils.randomString()
    const ctrlMsgHandler = new DummyCtrlMsgHandler()
    ctrlMsgHandler.setFlow(assetId, updateId)
    ctrlMsgHandler.setFlowURL(url)

    await createAgentRunningWithTestNodeRedSettings(t, ctrlMsgHandler)

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

    // give it 2s to start
    t.true(await polling(callback, 2000, 500, 30000))

    console.log(JSON.stringify(ctrlMsgHandler.getReportedStates()))
    const reportedStates = ctrlMsgHandler.getReportedStates()
    t.is(reportedStates.state.flow.flow.assetId, assetId)
    t.is(reportedStates.state.flow.flow.updateId, updateId)
    t.is(reportedStates.state.flow.flow.state, 'deployed')
    t.true(fs.existsSync(tmpNodeRedDataDir + '/flows.json'))

    return {
      ctrlMsgHandler: ctrlMsgHandler
    }
}

test.serial(
  'NodeRedController.1: Agent deploys flow to Node-Red via ctrl-msg correctly',
  async t => {
    await createAgentRunningWithDeployedFlow(t, 'flow1.json')
  }
)

test.serial(
  'NodeRedController.2: Agent handles flow deploy failure via ctrl-msg (flow/device/getFlowDataUrl return error)',
  async t => {
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

    const assetId = Utils.randomString()
    const updateId = Utils.randomString()
    const ctrlMsgHandler = new DummyCtrlMsgHandler()
    ctrlMsgHandler.setFlow(assetId, updateId)

    await createAgentRunningWithTestNodeRedSettings(t, ctrlMsgHandler)
    t.true(await nodeRedIsAlive(NodeRedPort))

    const reportedStates = ctrlMsgHandler.getReportedStates()
    const callback = async () => {
      if (reportedStates && reportedStates.state
          && reportedStates.state.flow && reportedStates.state.flow.flow
          && reportedStates.state.flow.flow.state === 'deployFail')
        return true
      return false
    }

    // give it 2s to start
    t.true(await polling(callback, 2000, 500, 10000))

    t.is(reportedStates.state.flow.flow.assetId, assetId)
    t.is(reportedStates.state.flow.flow.updateId, updateId)
    t.is(reportedStates.state.flow.flow.state, 'deployFail')
    t.is(reportedStates.state.flow.flow.message, 'Too many update attempts')
    t.is(ctrlMsgHandler.flowURLAttemptCount, 3)
  }
)

test.serial(
  'NodeRedController.3: Agent handles flow deploy failure via ctrl-msg (Node-RED start fail)',
  async t => {
    const expectedFlowName = "flow1.json"
    const expectedFlowJson = fs.readFileSync(
      path.join(__dirname, 'data', expectedFlowName),
      'utf8'
    )
    const url =
      'http://127.0.0.1:' +
      DummyServerPort +
      '/test/download-flow?flow=' +
      expectedFlowName

    const assetId = Utils.randomString()
    const updateId = Utils.randomString()
    const ctrlMsgHandler = new DummyCtrlMsgHandler()
    ctrlMsgHandler.setFlow(assetId, updateId)
    ctrlMsgHandler.setFlowURL(url)

    await createAgentRunningWithTestNodeRedSettings(t, ctrlMsgHandler, {
        NODE_RED_COMMAND:
          './node_modules/.bin/node-red-invalid -p ' +
          NodeRedPort +
          ' -s ' +
          tmpNodeRedDataDir +
          '/settings.js'
    })

    const reportedStates = ctrlMsgHandler.getReportedStates()
    const updateRequests = ctrlMsgHandler.getUpdateRequest()
    const callback = async () => {
      if (reportedStates && reportedStates.state
          && reportedStates.state.flow && reportedStates.state.flow.flow
          && reportedStates.state.flow.flow.state === 'deployFail')
        return true
      return false
    }

    // give it 2s to start
    t.true(await polling(callback, 2000, 500, 20000))

    t.is(reportedStates.state.flow.flow.assetId, assetId)
    t.is(reportedStates.state.flow.flow.updateId, updateId)
    t.is(reportedStates.state.flow.flow.state, 'deployFail')
    t.is(reportedStates.state.flow.flow.message, 'Too many update attempts')
    t.is(ctrlMsgHandler.flowURLAttemptCount, 3)
  }
)


test.serial(
  'NodeRedController.4: Deploying second flow while the first deployment is in progress',
  async t => {
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

    const assetId = Utils.randomString()
    const updateId = Utils.randomString()
    const ctrlMsgHandler = new DummyCtrlMsgHandler()
    ctrlMsgHandler.setFlow(assetId, updateId)
    ctrlMsgHandler.setFlowURL(url)
    // first flow return 
    ctrlMsgHandler.flowURLTimeout = true

    await createAgentRunningWithTestNodeRedSettings(t, ctrlMsgHandler)
    t.true(await nodeRedIsAlive(NodeRedPort))

    const updateRequests = ctrlMsgHandler.getUpdateRequest()
    const reportedStates = ctrlMsgHandler.getReportedStates()
    t.true(await polling(() => { return true }, 5 * 1000, 0, 10 * 1000))

    ctrlMsgHandler.flowURLTimeout = false
    const assetId2 = Utils.randomString()
    const updateId2 = Utils.randomString()
    const rawDesiredState = {}
    objectPath.set(rawDesiredState, 'flow.flow', {
        assetId: assetId2,
        updateId: updateId2
    })
    const desiredState = Utils.getDummyState('desired', rawDesiredState)
    connector.sendMessage('deviceStateChange', {
      type: 'desired',
      op: 'set',
      path: 'flow.flow',
      meta: desiredState.meta,
      state: desiredState.state.flow.flow
    })

    const callback = async () => {
      if (reportedStates && reportedStates.state
          && reportedStates.state.flow && reportedStates.state.flow.flow
          && reportedStates.state.flow.flow.state === 'deployed')
        return true
      return false
    }

    // give it 2s to start
    t.true(await polling(callback, 2000, 500, 30000))

    // TODO: should check the first flow's state
    console.log(updateRequests)

    t.is(reportedStates.state.flow.flow.assetId, assetId2)
    t.is(reportedStates.state.flow.flow.updateId, updateId2)
    t.is(reportedStates.state.flow.flow.state, 'deployed')
  }
)

test.serial(
  'NodeRedController.5: Agent remove existing flow via ctrl-msg correctly',
  async t => {
    const ret = await createAgentRunningWithDeployedFlow(t, 'flow1.json')
    const ctrlMsgHandler = ret.ctrlMsgHandler

    const reportedStates = ctrlMsgHandler.getReportedStates()
    const updateRequests = ctrlMsgHandler.getUpdateRequest()

    const desiredState = Utils.getDummyState('desired', { flow: {} })
    connector.sendMessage('deviceStateChange', {
      type: 'desired',
      op: 'remove',
      path: 'flow.flow',
      meta: desiredState.meta,
      state: desiredState.state.flow
    })

    const callback = async () => {
      if (reportedStates && reportedStates.state
          && reportedStates.state.flow && !reportedStates.state.flow.flow)
        return true
      return false
    }

    // give it 2s to start
    t.true(await polling(callback, 2000, 500, 30000))

    let index = updateRequests.length - 1
    t.is(updateRequests[index].path, 'flow.flow')
    t.is(updateRequests[index--].op, 'remove')
    t.is(updateRequests[index--].state.state, 'removing')
    t.is(updateRequests[index--].state.state, 'removePending')
    t.is(updateRequests[index--].state.state, 'deployed')
    t.is(updateRequests[index--].state.state, 'deploying')
    t.is(reportedStates.state.flow.flow, undefined)

    t.false(fs.existsSync(tmpNodeRedDataDir + '/flows.json'))
    t.false(fs.existsSync(tmpNodeRedDataDir + '/flows_cred.json'))
  }
)

test.serial(
  'NodeRedController.6: Agent remove absent flow via ctrl-msg',
  async t => {
    const ctrlMsgHandler = new DummyCtrlMsgHandler()

    await createAgentRunningWithTestNodeRedSettings(t, ctrlMsgHandler)
    t.true(await nodeRedIsAlive(NodeRedPort))

    const reportedStates = ctrlMsgHandler.getReportedStates()
    const updateRequests = ctrlMsgHandler.getUpdateRequest()

    const desiredState = Utils.getDummyState('desired', { flow: {} })
    connector.sendMessage('deviceStateChange', {
      type: 'desired',
      op: 'remove',
      path: 'flow.flow',
      meta: desiredState.meta,
      state: desiredState.state.flow
    })

    const callback = async () => {
      if (updateRequests && updateRequests.length > 1)
        return true
      return false
    }

    // give it 2s to start
    t.true(await polling(callback, 2000, 500, 30000))
    t.is(updateRequests[0].path, 'monitoring')
    t.is(updateRequests[1].path, 'monitoring')
  }
)

test.serial(
  'NodeRedController.7: Agent multiple re-deploy requests via ctrl-msg',
  async t => {
    const ret = await createAgentRunningWithDeployedFlow(t, 'flow1.json')
    const ctrlMsgHandler = ret.ctrlMsgHandler

    const reportedStates = ctrlMsgHandler.getReportedStates()
    const updateRequests = ctrlMsgHandler.getUpdateRequest()

    const assetId2 = Utils.randomString()
    const updateId2 = Utils.randomString()
    const rawDesiredState = {}
    objectPath.set(rawDesiredState, 'flow.flow', {
        assetId: assetId2,
        updateId: updateId2
    })
    const desiredState = Utils.getDummyState('desired', rawDesiredState)
    connector.sendMessage('deviceStateChange', {
      type: 'desired',
      op: 'set',
      path: 'flow.flow',
      meta: desiredState.meta,
      state: desiredState.state.flow.flow
    })

    const assetId3 = Utils.randomString()
    const updateId3 = Utils.randomString()
    const rawDesiredState3 = {}
    objectPath.set(rawDesiredState3, 'flow.flow', {
        assetId: assetId3,
        updateId: updateId3
    })
    const desiredState3 = Utils.getDummyState('desired', rawDesiredState3)
    connector.sendMessage('deviceStateChange', {
      type: 'desired',
      op: 'set',
      path: 'flow.flow',
      meta: desiredState3.meta,
      state: desiredState3.state.flow.flow
    })

    const callback = async () => {
      if (reportedStates && reportedStates.state
          && reportedStates.state.flow && reportedStates.state.flow.flow
          && reportedStates.state.flow.flow.state === 'deployed'
          && reportedStates.state.flow.flow.assetId === assetId3)
        return true
      return false
    }
    t.true(await polling(callback, 2000, 500, 30000))

    t.is(reportedStates.state.flow.flow.assetId, assetId3)
    t.is(reportedStates.state.flow.flow.updateId, updateId3)
    t.is(reportedStates.state.flow.flow.state, 'deployed')
  }
)

test.serial(
  'NodeRedController.8: Agent handles both deploy methods correctly',
  async t => {
    process.env.ENEBULAR_FLOW_STATE_PATH = '/tmp/enebular-flow-' + Utils.randomString()
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

    const ctrlMsgHandler = new DummyCtrlMsgHandler()

    await createAgentRunningWithTestNodeRedSettings(t, ctrlMsgHandler)

    // old method
    connector.sendMessage('deploy', {
      downloadUrl: url
    })

    let callback = async () => {
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

    const assetId = Utils.randomString()
    const updateId = Utils.randomString()
    const rawDesiredState = {}
    objectPath.set(rawDesiredState, 'flow.flow', {
        assetId: assetId,
        updateId: updateId
    })

    ctrlMsgHandler.setFlow(assetId, updateId)
    ctrlMsgHandler.setFlowURL(url)

    const desiredState = Utils.getDummyState('desired', rawDesiredState)
    // ctrl message method
    connector.sendMessage('deviceStateChange', {
      type: 'desired',
      op: 'set',
      path: 'flow.flow',
      meta: desiredState.meta,
      state: desiredState.state.flow.flow
    })

    const reportedStates = ctrlMsgHandler.getReportedStates()
    const updateRequests = ctrlMsgHandler.getUpdateRequest()

    callback = async () => {
      const api = new NodeRedAdminApi('http://127.0.0.1:' + NodeRedPort)
      const flow = await api.getFlow()
      if (flow) {
        t.truthy(flow)
        const expectedFlow = JSON.parse(expectedFlowJson)
        return Utils.jsonEquals(expectedFlow, flow)
      }
      return false
    }

    // give it 2s to start
    t.true(await polling(callback, 2000, 500, 30000))

    t.is(reportedStates.state.flow.flow.assetId, assetId)
    t.is(reportedStates.state.flow.flow.updateId, updateId)
    t.is(reportedStates.state.flow.flow.state, 'deployed')
    t.true(fs.existsSync(tmpNodeRedDataDir + '/flows.json'))
  }
)
 
