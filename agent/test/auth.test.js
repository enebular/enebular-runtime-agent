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
  givenAgentAuthenticated,
  givenAgentUnauthenticated
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
  server.removeAllListeners('authRequest')
  server.removeAllListeners('recordLogs')
  server.removeAllListeners('notifyStatus')
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

test.serial('Auth.1.Auth request can be triggered by updateAuth message', async t => {
  let authRequestReceived = false

  const ret = await givenAgentUnauthenticated(t, server, {}, 3002)
  agent = ret.agent
  connector = ret.connector

  server.on('authRequest', () => {
    // console.log("authRequest received.");
    authRequestReceived = true
  })
  connector.sendMessage('updateAuth', {
    idToken: '-', 
    accessToken: '-',
    state: '-'
  })
  return new Promise(async (resolve, reject) => {
    setTimeout(() => {
      t.true(authRequestReceived)
      resolve()
    }, 500)
  })
});

test.serial('Auth.2.Agent can be authenticated', async t => {
  const ret = await givenAgentAuthenticated(t, server, {}, 3002)
  agent = ret.agent
  connector = ret.connector

  t.is(agent._agentState, 'authenticated')
});


