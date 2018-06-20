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
} from './helpers/agent-helper'

let agent: EnebularAgent
let connector: ConnectorService
let server: DummyServer
let http: Server

test.before(async t => {
  process.env.DEBUG = "debug";
  server = new DummyServer()
  http = await server.start(3002)
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


