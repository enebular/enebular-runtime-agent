import test from 'ava';
import fs from 'fs'
import {Server} from 'net'

import EnebularAgent from '../src/enebular-agent'
import ConnectorService from '../src/connector-service'
import NodeRedAdminApi from './helpers/node-red-admin-api'
import Utils from './helpers/utils'
import DummyServer from './helpers/dummy-server'
import {
  givenAgentConnectedToConnector,
  givenAgentStarted
} from './helpers/agent-helper'

const DummyServerPort = 3004
const NodeRedPort = 4004

let agent: EnebularAgent
let connector: ConnectorService
let server: DummyServer
let http: Server

test.before(async t => {
  process.env.DEBUG = "debug";
  server = new DummyServer()
  http = await server.start(DummyServerPort)
});

test.after(t => {
  http.close()
});

test.afterEach.always('cleanup listenser', t => {
  server.removeAllListeners('verifyLicense')
  server.removeAllListeners('activateLicense')
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
});

test.serial('NodeRedController.1.Agent starts node-red correctly', async t => {
  const configFile = Utils.getDummyEnebularConfig({}, DummyServerPort)
  const ret = await givenAgentConnectedToConnector(t,
      Utils.addNodeRedPort({configFile: configFile}, NodeRedPort))
  agent = ret.agent
  connector = ret.connector

  return new Promise((resolve, reject) => {
    setTimeout(async () => {
      let api = new NodeRedAdminApi("http://127.0.0.1:" + NodeRedPort);
      const settings = await api.getSettings()
      if (!settings) {
        reject(new Error("api return error"))
      }
      else {
        t.truthy(settings)
        resolve();
      }
    }, 500)
  })
});

