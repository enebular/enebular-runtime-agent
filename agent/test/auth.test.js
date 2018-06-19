import test from 'ava';
import fs from 'fs'

import EnebularAgent from '../src/enebular-agent'
import ConnectorService from '../src/connector-service'
import NodeRedAdminApi from './helpers/node-red-admin-api'
import Utils from './helpers/utils'
import DummyEnebularServer from './helpers/dummy-enebular-server'
import {
  givenAgentConnectedToConnector,
  givenAgentAuthenticated,
  givenAgentUnauthenticated
} from './helpers/agent-helper'

let agent: EnebularAgent
let connector: ConnectorService
let server: DummyEnebularServer

test.before(async t => {
  process.env.DEBUG = "debug";
  server = new DummyEnebularServer()
  await server.start(3001)
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
  server.on('authRequest', () => {
    console.log("authRequest received.");
    authRequestReceived = true
  })

  await givenAgentUnauthenticated(t, server)

  // connector.sendMessage('register', config)
  return new Promise(async (resolve, reject) => {
    setTimeout(() => {
      t.true(authRequestReceived)
      resolve()
    }, 500)
  })
});


