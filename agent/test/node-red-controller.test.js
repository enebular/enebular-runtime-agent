/* @flow */
import test from 'ava'
import fs from 'fs-extra'
import path from 'path'
import { Server } from 'net'
import crypto from 'crypto'
import express from 'express'
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
  waitNodeRedToDie,
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

    await createAgentRunningWithTestNodeRedSettings(t, ctrlMsgHandler, {
      ENEBULAR_FLOW_STATE_PATH: '/tmp/enebular-flow-' + Utils.randomString(),
    })
    const reportedStates = ctrlMsgHandler.getReportedStates()
    const callback = async () => {
      if (reportedStates && reportedStates.state 
          && reportedStates.state.flow
          && reportedStates.state.flow.flow
          && reportedStates.state.flow.flow.assetId === assetId
          && reportedStates.state.flow.flow.updateId === updateId
          && reportedStates.state.flow.flow.state === 'deployed')
        return true
      return false
    }

    // give it 2s to start
    t.true(await polling(callback, 2000, 500, 30000))
    const api = new NodeRedAdminApi('http://127.0.0.1:' + NodeRedPort)
    const flow = await api.getFlow()
    t.truthy(flow)
    const expectedFlow = JSON.parse(expectedFlowJson)
    t.true(Utils.jsonEquals(expectedFlow, flow))
    t.true(fs.existsSync(tmpNodeRedDataDir + '/flows.json'))

    return {
      ctrlMsgHandler: ctrlMsgHandler
    }
}

async function DeployFlowCtrlMsg(
  t: test,
  ctrlMsgHandler,
) {
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

    const callback = async () => {
      if (reportedStates && reportedStates.state
          && reportedStates.state.flow && reportedStates.state.flow.flow
          && reportedStates.state.flow.flow.state === 'deployed'
          && reportedStates.state.flow.flow.assetId === assetId)
        return true
      return false
    }

    // give it 2s to start
    await polling(callback, 2000, 500, 120 * 1000)

    // console.log(reportedStates)
    // console.log(updateRequests)
    t.is(reportedStates.state.flow.flow.assetId, assetId)
    t.is(reportedStates.state.flow.flow.updateId, updateId)
    t.is(reportedStates.state.flow.flow.state, 'deployed')
    t.true(fs.existsSync(tmpNodeRedDataDir + '/flows.json'))
}

function flowEnableRequest(connector, enable, _desiredState) {
  const rawDesiredState = _desiredState ? _desiredState : {}
  objectPath.set(rawDesiredState, 'flow.enable', enable)
  const desiredState = Utils.getDummyState('desired', rawDesiredState)
  connector.sendMessage('deviceStateChange', {
    type: 'desired',
    op: 'set',
    path: 'flow.enable',
    meta: desiredState.meta,
    state: desiredState.state.flow.enable
  })
}

function reportedFlowEnableIs(reportedStates, enable) {
  const callback = () => {
    if (reportedStates && reportedStates.state
        && reportedStates.state.flow
        && reportedStates.state.flow.enable === enable)
      return true
    return false
  }
  return polling(callback, 0, 500, 10000)
}

function statusFlowStateIs(statusStates, state) {
  const callback = () => {
    if (statusStates && statusStates.state
        && statusStates.state.flow
        && statusStates.state.flow.state === state)
      return true
    return false
  }
  return polling(callback, 0, 500, 10000)
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

    await createAgentRunningWithTestNodeRedSettings(t, ctrlMsgHandler, {
      ENEBULAR_FLOW_STATE_PATH: '/tmp/enebular-flow-' + Utils.randomString(),
    })
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
      ENEBULAR_FLOW_STATE_PATH: '/tmp/enebular-flow-' + Utils.randomString(),
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

/*
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

    await createAgentRunningWithTestNodeRedSettings(t, ctrlMsgHandler, {
      ENEBULAR_FLOW_STATE_PATH: '/tmp/enebular-flow-' + Utils.randomString(),
    })

    const updateRequests = ctrlMsgHandler.getUpdateRequest()
    const reportedStates = ctrlMsgHandler.getReportedStates()
    t.true(await polling(() => { return true }, 5 * 1000, 0, 5 * 1000))

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

    await createAgentRunningWithTestNodeRedSettings(t, ctrlMsgHandler, {
      ENEBULAR_FLOW_STATE_PATH: '/tmp/enebular-flow-' + Utils.randomString(),
    })

    const updateRequests = ctrlMsgHandler.getUpdateRequest()
    const reportedStates = ctrlMsgHandler.getReportedStates()
    t.true(await polling(() => { return true }, 5 * 1000, 0, 5 * 1000))

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

    await createAgentRunningWithTestNodeRedSettings(t, ctrlMsgHandler)
    t.true(await nodeRedIsAlive(NodeRedPort))

    const reportedStates = ctrlMsgHandler.getReportedStates()
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
*/

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
    t.is(reportedStates.state.flow.flow, undefined)
    t.false(fs.existsSync(tmpNodeRedDataDir + '/flows.json'))
    t.false(fs.existsSync(tmpNodeRedDataDir + '/flows_cred.json'))
  }
)
*/

test.serial(
  'NodeRedController.6: Agent handles multiple re-deploy requests via ctrl-msg',
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

    await createAgentRunningWithTestNodeRedSettings(t, ctrlMsgHandler, {
      ENEBULAR_FLOW_STATE_PATH: '/tmp/enebular-flow-' + Utils.randomString(),
    })

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

    await DeployFlowCtrlMsg(t, ctrlMsgHandler)
  }
)

test.serial(
  'NodeRedController.9: Agent refreshes uninitialised states when state is changed',
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

    const ctrlMsgHandler = new DummyCtrlMsgHandler()
    // This casues agent fails to refresh state at boot
    ctrlMsgHandler.ctrlMsgRequestTimeout = true

    await createAgentRunningWithTestNodeRedSettings(t, ctrlMsgHandler, {
        ENEBULAR_CONNECTOR_MESSENGER_REQ_RETYR_TIMEOUT: 1000,
        ENEBULAR_FLOW_STATE_PATH: '/tmp/enebular-flow-' + Utils.randomString()
    })
    t.true(await nodeRedIsAlive(NodeRedPort))
    await polling(() => { return true }, 5000, 0, 5000)

    ctrlMsgHandler.ctrlMsgRequestTimeout = false
    await DeployFlowCtrlMsg(t, ctrlMsgHandler)
  }
)

test.serial(
  'NodeRedController.10: Agent recovers from ctrl message request retry',
  async t => {
    const ctrlMsgHandler = new DummyCtrlMsgHandler()
    await createAgentRunningWithTestNodeRedSettings(t, ctrlMsgHandler, {
        ENEBULAR_CONNECTOR_MESSENGER_REQ_RETYR_TIMEOUT: 3000,
        ENEBULAR_FLOW_STATE_PATH: '/tmp/enebular-flow-' + Utils.randomString()
    })
    t.true(await nodeRedIsAlive(NodeRedPort))
    await polling(() => { return true }, 5000, 0, 5000)

    ctrlMsgHandler.ctrlMsgRequestTimeout = true

    setTimeout(() => {
      ctrlMsgHandler.ctrlMsgRequestTimeout = false
    }, 15 * 1000)
    await DeployFlowCtrlMsg(t, ctrlMsgHandler)
  }
)

test.serial(
  'NodeRedController.11: Agent refreshes state periodically',
  async t => {
    const ctrlMsgHandler = new DummyCtrlMsgHandler()
    ctrlMsgHandler.ctrlMsgRequestTimeout = true
    await createAgentRunningWithTestNodeRedSettings(t, ctrlMsgHandler, {
        ENEBULAR_FLOW_STATE_PATH: '/tmp/enebular-flow-' + Utils.randomString(),
        ENEBULAR_CONNECTOR_MESSENGER_REQ_RETYR_TIMEOUT: 500,
        ENEBULAR_DEVICE_STATE_REFRESH_INTERVAL: 10
    })
    t.true(await nodeRedIsAlive(NodeRedPort))
    await polling(() => { return true }, 8000, 0, 8000)

    ctrlMsgHandler.ctrlMsgRequestTimeout = false
    const reportedStates = ctrlMsgHandler.getReportedStates()
    const callback = async () => {
      if (reportedStates && reportedStates.state
          && reportedStates.state.monitoring
          && reportedStates.state.monitoring.enable)
        return true
      return false
    }
    t.true(await polling(callback, 2000, 500, 30000))
    // reported: flow.enable == true
    t.true(await reportedFlowEnableIs(reportedStates, true))
    // status: flow.state == running
    t.true(await statusFlowStateIs(statusStates, 'running'))
  }
)


test.serial(
  'NodeRedController.12: Agent handles flow enable and disable',
  async t => {
    const ctrlMsgHandler = new DummyCtrlMsgHandler()

    await createAgentRunningWithTestNodeRedSettings(t, ctrlMsgHandler, {
      ENEBULAR_FLOW_STATE_PATH: '/tmp/enebular-flow-' + Utils.randomString(),
    })
    t.true(await nodeRedIsAlive(NodeRedPort))

    const reportedStates = ctrlMsgHandler.getReportedStates()
    const statusStates = ctrlMsgHandler.getStatusStates()
    const updateRequests = ctrlMsgHandler.getUpdateRequest()

    flowEnableRequest(connector, false)
    t.true(await waitNodeRedToDie(NodeRedPort))
    // reported: flow.enable == false
    t.true(await reportedFlowEnableIs(reportedStates, false))
    // status: flow.state == stopped
    t.true(await statusFlowStateIs(statusStates, 'stopped'))

    flowEnableRequest(connector, true)
    const callback = async () => {
      return await nodeRedIsAlive(NodeRedPort)
    }
    t.true(await polling(callback, 2000, 500, 30000))
    // reported: flow.enable == true
    t.true(await reportedFlowEnableIs(reportedStates, true))
    // status: flow.state == running
    t.true(await statusFlowStateIs(statusStates, 'running'))
  }
)

test.serial(
  'NodeRedController.13: Agent handles multiple flow enable requests',
  async t => {
    const ctrlMsgHandler = new DummyCtrlMsgHandler()

    await createAgentRunningWithTestNodeRedSettings(t, ctrlMsgHandler, {
      ENEBULAR_FLOW_STATE_PATH: '/tmp/enebular-flow-' + Utils.randomString(),
    })
    t.true(await nodeRedIsAlive(NodeRedPort))

    const reportedStates = ctrlMsgHandler.getReportedStates()
    const statusStates = ctrlMsgHandler.getStatusStates()
    const updateRequests = ctrlMsgHandler.getUpdateRequest()

    flowEnableRequest(connector, false)
    flowEnableRequest(connector, true)
    flowEnableRequest(connector, false)
    flowEnableRequest(connector, true)
    flowEnableRequest(connector, false)
    flowEnableRequest(connector, true)

    const callback = async () => {
      return await nodeRedIsAlive(NodeRedPort)
    }
    t.true(await polling(callback, 2000, 500, 30000))
    // reported: flow.enable == true
    t.true(await reportedFlowEnableIs(reportedStates, true))
    // status: flow.state == running
    t.true(await statusFlowStateIs(statusStates, 'running'))

    flowEnableRequest(connector, false)
    flowEnableRequest(connector, true)
    flowEnableRequest(connector, false)
    flowEnableRequest(connector, true)
    flowEnableRequest(connector, false)
    flowEnableRequest(connector, true)
    flowEnableRequest(connector, false)

    t.true(await waitNodeRedToDie(NodeRedPort))
    t.true(await reportedFlowEnableIs(reportedStates, false))
    t.true(await statusFlowStateIs(statusStates, 'stopped'))
  }
)

test.serial(
  'NodeRedController.14: Agent handles flow enable and disable after flow has been deployed',
  async t => {
    const ret = await createAgentRunningWithDeployedFlow(t, 'flow1.json')
    const ctrlMsgHandler = ret.ctrlMsgHandler

    const reportedStates = ctrlMsgHandler.getReportedStates()
    const statusStates = ctrlMsgHandler.getStatusStates()
    const desiredStates = ctrlMsgHandler.getDesiredStates()
    const updateRequests = ctrlMsgHandler.getUpdateRequest()

    flowEnableRequest(connector, false, desiredStates)
    t.true(await waitNodeRedToDie(NodeRedPort))
    // reported: flow.enable == false
    t.true(await reportedFlowEnableIs(reportedStates, false))
    // status: flow.state == stopped
    t.true(await statusFlowStateIs(statusStates, 'stopped'))

    flowEnableRequest(connector, true, desiredStates)
    const callback = async () => {
      return await nodeRedIsAlive(NodeRedPort)
    }
    t.true(await polling(callback, 2000, 500, 30000))
    // reported: flow.enable == true
    t.true(await reportedFlowEnableIs(reportedStates, true))
    // status: flow.state == running
    t.true(await statusFlowStateIs(statusStates, 'running'))

    const expectedFlowJson = fs.readFileSync(
      path.join(__dirname, 'data', 'flow1.json'),
      'utf8'
    )
    const api = new NodeRedAdminApi('http://127.0.0.1:' + NodeRedPort)
    const flow = await api.getFlow()
    t.truthy(flow)
    const expectedFlow = JSON.parse(expectedFlowJson)
    t.true(Utils.jsonEquals(expectedFlow, flow))
  }
)

test.serial(
  'NodeRedController.15: Agent shall not start Node-RED if flow is not enabled when booting',
  async t => {
    const tmpFlowStateFile = '/tmp/enebular-flow-' + Utils.randomString()
    fs.writeFileSync(
      tmpFlowStateFile,
      JSON.stringify({ enable: false }),
      'utf8'
    )

    const ctrlMsgHandler = new DummyCtrlMsgHandler()
    const statusStates = ctrlMsgHandler.getStatusStates()
    const desiredStates = ctrlMsgHandler.getDesiredStates()
    ctrlMsgHandler.setFlowEnable(false)

    await createAgentRunningWithTestNodeRedSettings(t, ctrlMsgHandler, {
      ENEBULAR_FLOW_STATE_PATH: tmpFlowStateFile,
    })

    let callback = async () => {
      return await nodeRedIsAlive(NodeRedPort)
    }
    t.false(await polling(callback, 0, 500, 5000))
    t.true(statusStates.state.flow.state === 'stopped')

    flowEnableRequest(connector, true, desiredStates)
    callback = async () => {
      return await nodeRedIsAlive(NodeRedPort)
    }
    t.true(await polling(callback, 2000, 500, 30000))
    // status: flow.state == running
    t.true(await statusFlowStateIs(statusStates, 'running'))
  }
)

test.serial(
  'NodeRedController.16: Agent reports Node-RED error status',
  async t => {
    const ret = await createAgentRunningWithDeployedFlow(t, 'flow1.json')
    const ctrlMsgHandler = ret.ctrlMsgHandler

    const reportedStates = ctrlMsgHandler.getReportedStates()
    const statusStates = ctrlMsgHandler.getStatusStates()
    const desiredStates = ctrlMsgHandler.getDesiredStates()
    const updateRequests = ctrlMsgHandler.getUpdateRequest()

    agent._nodeRed._cproc.kill('SIGTERM')

    t.true(await statusFlowStateIs(statusStates, 'error'))
    t.true(await statusFlowStateIs(statusStates, 'running'))
  }
)

test.serial(
  'NodeRedController.17: Flow is enabled if Node-RED fails to start',
  async t => {
    const tmpFlowStateFile = '/tmp/enebular-flow-' + Utils.randomString()
    fs.writeFileSync(
      tmpFlowStateFile,
      JSON.stringify({ enable: false }),
      'utf8'
    )

    const ctrlMsgHandler = new DummyCtrlMsgHandler()
    const statusStates = ctrlMsgHandler.getStatusStates()
    const desiredStates = ctrlMsgHandler.getDesiredStates()
    const reportedStates = ctrlMsgHandler.getReportedStates()
    ctrlMsgHandler.setFlowEnable(false)

    await createAgentRunningWithTestNodeRedSettings(t, ctrlMsgHandler, {
      ENEBULAR_FLOW_STATE_PATH: tmpFlowStateFile,
    })

    let callback = async () => {
      return await nodeRedIsAlive(NodeRedPort)
    }
    t.false(await polling(callback, 0, 500, 5000))
    t.true(statusStates.state.flow.state === 'stopped')

    agent._nodeRed._shutdownRequested = true

    flowEnableRequest(connector, true, desiredStates)
    // reported: flow.enable == true
    t.true(await reportedFlowEnableIs(reportedStates, true))
    // status: flow.state == running
    t.true(await statusFlowStateIs(statusStates, 'error'))
  }
)

test.serial(
  'NodeRedController.18: Agent reports error when starting flow timed out',
  async t => {
    const tmpFlowStateFile = '/tmp/enebular-flow-' + Utils.randomString()
    const ctrlMsgHandler = new DummyCtrlMsgHandler()
    // set log to minimum so we won't know if it started or not
    const settings = path.join(
      __dirname,
      'data',
      'node-red-test-settings-log-minimum'
    )

    await createAgentRunningWithTestNodeRedSettings(t, ctrlMsgHandler, {
      ENEBULAR_FLOW_STATE_PATH: tmpFlowStateFile,
      ENEBULAR_NODE_RED_FLOW_START_TIMEOUT: 5000,
      NODE_RED_COMMAND:
        './node_modules/.bin/node-red -p ' +
        NodeRedPort +
        ' -s ' + settings
    })

    const reportedStates = ctrlMsgHandler.getReportedStates()
    const statusStates = ctrlMsgHandler.getStatusStates()
    const desiredStates = ctrlMsgHandler.getDesiredStates()
    const updateRequests = ctrlMsgHandler.getUpdateRequest()

    const callback = () => {
      if (statusStates && statusStates.state
          && statusStates.state.flow
          && statusStates.state.flow.state === 'error'
          && statusStates.state.flow.message === 'Flow start timed out')
        return true
      return false
    }
    t.true(await polling(callback, 0, 500, 30000))
  }
)

test.serial(
  'NodeRedController.19: Agent captures error if Node-RED fails to start (port in use)',
  async t => {
    const app = express()
    let http
    await new Promise(resolve => {
      http = app.listen(NodeRedPort, () => {
        resolve(http)
      })
    })

    const tmpFlowStateFile = '/tmp/enebular-flow-' + Utils.randomString()
    const ctrlMsgHandler = new DummyCtrlMsgHandler()
    const statusStates = ctrlMsgHandler.getStatusStates()
    const desiredStates = ctrlMsgHandler.getDesiredStates()

    await createAgentRunningWithTestNodeRedSettings(t, ctrlMsgHandler, {
      ENEBULAR_FLOW_STATE_PATH: tmpFlowStateFile,
    })

    let retryCount = 0
    const callback = () => {
      if (statusStates && statusStates.state
          && statusStates.state.flow
          && statusStates.state.flow.state === 'error'
          && statusStates.state.flow.message === 'Service exited, code 1') {
        return true
      }
      return false
    }
    t.true(await polling(callback, 0, 500, 30000))
    http.close()
  }
)

test.serial(
  'NodeRedController.20: Agent shall restart Node-RED if flow.enable state is cleared',
  async t => {
    const tmpFlowStateFile = '/tmp/enebular-flow-' + Utils.randomString()
    const ctrlMsgHandler = new DummyCtrlMsgHandler()
    const statusStates = ctrlMsgHandler.getStatusStates()
    const desiredStates = ctrlMsgHandler.getDesiredStates()
    const reportedStates = ctrlMsgHandler.getReportedStates()

    await createAgentRunningWithTestNodeRedSettings(t, ctrlMsgHandler, {
      ENEBULAR_FLOW_STATE_PATH: tmpFlowStateFile,
    })

    t.true(await statusFlowStateIs(statusStates, 'running'))

    flowEnableRequest(connector, false)
    t.true(await waitNodeRedToDie(NodeRedPort))
    // reported: flow.enable == false
    t.true(await reportedFlowEnableIs(reportedStates, false))
    // status: flow.state == stopped
    t.true(await statusFlowStateIs(statusStates, 'stopped'))

    const desiredState = Utils.getDummyState('desired', { flow: {} })
    connector.sendMessage('deviceStateChange', {
      type: 'desired',
      op: 'remove',
      path: 'flow.enable',
      meta: desiredState.meta,
      state: desiredState.state.flow
    })

    // status: flow.state == running
    t.true(await statusFlowStateIs(statusStates, 'running'),
        'Node-RED restarted if flow.enable is cleared')
  }
)

test.serial(
  'NodeRedController.21: Agent shall restart Node-RED if flow.enable state is cleared',
  async t => {
    const tmpFlowStateFile = '/tmp/enebular-flow-' + Utils.randomString()
    const url =
      'http://127.0.0.1:' +
      DummyServerPort +
      '/test/download-flow?flow=' +
      'flow1.json'
    const assetId = Utils.randomString()
    const updateId = Utils.randomString()

    const ctrlMsgHandler = new DummyCtrlMsgHandler()
    const statusStates = ctrlMsgHandler.getStatusStates()
    const desiredStates = ctrlMsgHandler.getDesiredStates()
    const reportedStates = ctrlMsgHandler.getReportedStates()

    await createAgentRunningWithTestNodeRedSettings(t, ctrlMsgHandler, {
      ENEBULAR_FLOW_STATE_PATH: tmpFlowStateFile,
    })

    t.true(await statusFlowStateIs(statusStates, 'running'))

    ctrlMsgHandler.setFlow(assetId, updateId)
    ctrlMsgHandler.setFlowURL(url)

    const rawDesiredState = {}
    objectPath.set(rawDesiredState, 'flow.flow', {
        assetId: assetId,
        updateId: updateId
    })
    objectPath.set(rawDesiredState, 'flow.enable', false)
    const desiredState = Utils.getDummyState('desired', rawDesiredState)
    connector.sendMessage('deviceStateChange', {
      type: 'desired',
      op: 'set',
      path: 'flow',
      meta: desiredState.meta,
      state: desiredState.state.flow
    })

    t.true(await waitNodeRedToDie(NodeRedPort))
    // reported: flow.enable == false
    t.true(await reportedFlowEnableIs(reportedStates, false))
    // status: flow.state == stopped
    t.true(await statusFlowStateIs(statusStates, 'stopped'))
  }
)

test.serial(
  'NodeRedController.22: Node-Red should not be restarted if flow is disabled when deploying',
  async t => {
    const tmpFlowStateFile = '/tmp/enebular-flow-' + Utils.randomString()
    fs.writeFileSync(
      tmpFlowStateFile,
      JSON.stringify({ enable: false }),
      'utf8'
    )
    const url =
      'http://127.0.0.1:' +
      DummyServerPort +
      '/test/download-flow?flow=' +
      'flow1.json'

    const ctrlMsgHandler = new DummyCtrlMsgHandler()
    const statusStates = ctrlMsgHandler.getStatusStates()
    const desiredStates = ctrlMsgHandler.getDesiredStates()
    const reportedStates = ctrlMsgHandler.getReportedStates()
    ctrlMsgHandler.setFlowURL(url)
    ctrlMsgHandler.setFlowEnable(false)

    await createAgentRunningWithTestNodeRedSettings(t, ctrlMsgHandler, {
      ENEBULAR_FLOW_STATE_PATH: tmpFlowStateFile,
    })

    const assetId = Utils.randomString()
    const updateId = Utils.randomString()
    const rawDesiredState = desiredStates
    objectPath.set(rawDesiredState, 'flow.flow', {
        assetId: assetId,
        updateId: updateId
    })

    const desiredState = Utils.getDummyState('desired', rawDesiredState)
    // ctrl message method
    connector.sendMessage('deviceStateChange', {
      type: 'desired',
      op: 'set',
      path: 'flow.flow',
      meta: desiredState.meta,
      state: desiredState.state.flow.flow
    })

    const callback = () => {
      return (statusStates && statusStates.state
          && statusStates.state.flow
          && statusStates.state.flow.state === 'running')
    }
    t.false(await polling(callback, 0, 500, 5000), 'should never change to running')
  }
)




