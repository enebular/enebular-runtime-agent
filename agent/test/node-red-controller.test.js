import test from 'ava';
import fs from 'fs-extra'
import path from 'path'
import {Server} from 'net'

import EnebularAgent from '../src/enebular-agent'
import ConnectorService from '../src/connector-service'
import NodeRedAdminApi from './helpers/node-red-admin-api'
import Utils from './helpers/utils'
import DummyServer from './helpers/dummy-server'
import {
  givenAgentUnauthenticated,
  givenAgentConnectedToConnector,
  givenAgentStarted,
  nodeRedIsDead,
  nodeRedIsAlive
} from './helpers/agent-helper'

const DummyServerPort = 3004
const NodeRedPort = 4004

let agent: EnebularAgent
let connector: ConnectorService
let server: DummyServer
let http: Server
let tmpNodeRedDataDir: string

test.before(async t => {
  process.env.DEBUG = "info";
  server = new DummyServer()
  http = await server.start(DummyServerPort)
});

test.after(t => {
  http.close()
});

test.afterEach.always('cleanup', async t => {
  if (agent) {
    console.log("cleanup: agent");
    await agent.shutdown().catch(function(error) {
        // ignore the error
      // console.log(error);
    });
    agent = null
  }
  if (tmpNodeRedDataDir) {
    fs.removeSync(tmpNodeRedDataDir)
    tmpNodeRedDataDir = null
  }
});

async function givenAgentRunningWithTestNodeRedSettings(t: test) {
  const api = new NodeRedAdminApi("http://127.0.0.1:" + NodeRedPort);
  const configFile = Utils.getDummyEnebularConfig({}, DummyServerPort)
  tmpNodeRedDataDir = '/tmp/.node-red-config-' + Utils.randomString();
  await Utils.rsync(tmpNodeRedDataDir + "/",
      path.join(__dirname, "..", "..", "node-red", ".node-red-config") + "/")
  await Utils.rsync(tmpNodeRedDataDir + "/test-settings.js",
      path.join(__dirname, "data", "test-settings"))

  const ret = await givenAgentUnauthenticated(t, server, {
    nodeRedDataDir: tmpNodeRedDataDir,
    nodeRedCommand: "./node_modules/.bin/node-red -p " + NodeRedPort + " -s "
      + tmpNodeRedDataDir+ "/test-settings.js",
  }, DummyServerPort)
  agent = ret.agent
  connector = ret.connector

  // console.log("user directory: ", agent._nodeRed._getDataDir())
  await nodeRedIsAlive(NodeRedPort).catch((err) => {
    t.fail()
  })
}

test.serial('NodeRedController.1.Agent starts/shutdowns node-red correctly', async t => {
  const api = new NodeRedAdminApi("http://127.0.0.1:" + NodeRedPort);
  const configFile = Utils.getDummyEnebularConfig({}, DummyServerPort)
  const ret = await givenAgentConnectedToConnector(t,
      Utils.addNodeRedPort({configFile: configFile}, NodeRedPort))
  agent = ret.agent
  connector = ret.connector

  await nodeRedIsAlive(NodeRedPort).catch((err) => {
    t.fail()
  })

  await agent.shutdown()
  await nodeRedIsDead(NodeRedPort, 1).catch((err) => {
    t.fail()
  })
  t.pass()
});

test.serial('NodeRedController.2.Agent restarts node-red correctly', async t => {
  const api = new NodeRedAdminApi("http://127.0.0.1:" + NodeRedPort);
  const configFile = Utils.getDummyEnebularConfig({}, DummyServerPort)

  const data = fs.readFileSync(path.join(__dirname, "data", "flow1.json"), 'utf8')
  let flowFileName = '/tmp/.enebular-flow-' + Utils.randomString() + '.json';
  fs.writeFileSync(flowFileName, data)

  const ret = await givenAgentConnectedToConnector(t, {
    nodeRedCommand: "./node_modules/.bin/node-red -p " + NodeRedPort + " " + flowFileName,
  })
  agent = ret.agent
  connector = ret.connector

  await nodeRedIsAlive(NodeRedPort).catch((err) => {
    t.fail()
  })
  // update the flow
  const expectedFlowJson = fs.readFileSync(path.join(__dirname, "data", "flow2.json"), 'utf8')
  fs.writeFileSync(flowFileName, expectedFlowJson)

  connector.sendMessage('restart')
  return new Promise((resolve, reject) => {
    setTimeout(async () => {
      const flow = await api.getFlow()
      // console.log("Api return flow:", flow)
      if (!flow) {
        reject(new Error("api return error"))
        t.fail()
      }
      else {
        t.truthy(flow)
        const expectedFlow = JSON.parse(expectedFlowJson)
        t.deepEqual(expectedFlow, flow)
        resolve();
      }
    }, 3000)
  })
});

test.serial('NodeRedController.3.Agent handles deploy message correctly', async t => {
  await givenAgentRunningWithTestNodeRedSettings(t, server)

  // update the flow
  const expectedFlowName = "flow1.json"
  const expectedFlowJson = fs.readFileSync(path.join(__dirname, "data", expectedFlowName), 'utf8')
  const url = "http://127.0.0.1:" + DummyServerPort + "/download?flow=" + expectedFlowName
  connector.sendMessage('deploy', { 
      downloadUrl: url
  })
  return new Promise((resolve, reject) => {
    setTimeout(async () => {
      const api = new NodeRedAdminApi("http://127.0.0.1:" + NodeRedPort);
      const flow = await api.getFlow()
      // console.log("Api return flow:", flow)
      if (!flow) {
        reject(new Error("api return error"))
        t.fail()
      }
      else {
        t.truthy(flow)
        const expectedFlow = JSON.parse(expectedFlowJson)
        t.deepEqual(expectedFlow, flow)
        resolve();
      }
    }, 3000)
  })
});

test.serial('NodeRedController.4.Agent handles update-flow message correctly', async t => {
  await givenAgentRunningWithTestNodeRedSettings(t, server)

  // update the flow
  const expectedFlowName = "flow2.json"
  const expectedFlowJson = fs.readFileSync(path.join(__dirname, "data", expectedFlowName), 'utf8')
  const url = "http://127.0.0.1:" + DummyServerPort + "/download?flow=" + expectedFlowName
  connector.sendMessage('update-flow', { 
      downloadUrl: url
  })
  return new Promise((resolve, reject) => {
    setTimeout(async () => {
      const api = new NodeRedAdminApi("http://127.0.0.1:" + NodeRedPort);
      const flow = await api.getFlow()
      // console.log("Api return flow:", flow)
      if (!flow) {
        reject(new Error("api return error"))
        t.fail()
      }
      else {
        t.truthy(flow)
        const expectedFlow = JSON.parse(expectedFlowJson)
        t.deepEqual(expectedFlow, flow)
        resolve();
      }
    }, 3000)
  })
});

test.serial('NodeRedController.5.Agent handles shutdown/start message correctly', async t => {
  await givenAgentRunningWithTestNodeRedSettings(t, server)

  connector.sendMessage('shutdown')
  await nodeRedIsDead(NodeRedPort).catch((err) => {
    t.fail(err)
  })

  connector.sendMessage('start')
  await nodeRedIsAlive(NodeRedPort, 3000).catch((err) => {
    t.fail(err)
  })
  t.pass()
});

test.serial('NodeRedController.6.Agent handles deploy dependencies correctly', async t => {
  await givenAgentRunningWithTestNodeRedSettings(t, server)

  // update the flow
  const expectedFlowName = "flow1.json"
  const expectedFlowJson = fs.readFileSync(path.join(__dirname, "data", expectedFlowName), 'utf8')
  const url = "http://127.0.0.1:" + DummyServerPort + "/download?dependencies=on&flow=" + expectedFlowName
  connector.sendMessage('deploy', { 
      downloadUrl: url
  })
  return new Promise((resolve, reject) => {
    setTimeout(async () => {
        if (fs.existsSync(tmpNodeRedDataDir + "/node_modules/node-red-node-pi-gpiod")) {
          t.pass()
        }
        else {
          t.fail("dependencies failed to install")
        }
        resolve()
    }, 3000)
  })
});

test.serial.todo('TODO: NodeRedController.7.Agent handles deploy creds correctly')








