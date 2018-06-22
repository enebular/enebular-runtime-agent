import test from 'ava';
import fs from 'fs'
import {Server} from 'net'
import jwt from 'jsonwebtoken'

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

const DummyServerPort = 3002
const NodeRedPort = 4002

let agent: EnebularAgent
let connector: ConnectorService
let server: DummyServer
let http: Server

test.before(async t => {
  process.env.DEBUG = "info";
  server = new DummyServer()
  http = await server.start(DummyServerPort)
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

  const ret = await givenAgentUnauthenticated(t, server, 
      Utils.addNodeRedPort({}, NodeRedPort), DummyServerPort)
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
  const ret = await givenAgentAuthenticated(t, server,
      Utils.addNodeRedPort({}, NodeRedPort), DummyServerPort)
  agent = ret.agent
  connector = ret.connector

  t.is(agent._agentState, 'authenticated')
  t.is(agent._agentMan._accessToken, 'dummy_access_token')
});

test.serial('Auth.3.Agent handles auth request failure(http)', async t => {
  const configFile = Utils.getDummyEnebularConfig({
      authRequestUrl: "http://invalidate-url:3222/api/v1/token/device",
  })
  const ret = await givenAgentConnectedToConnector(t,
      Utils.addNodeRedPort({configFile: configFile}, NodeRedPort))
  agent = ret.agent
  connector = ret.connector
  return await new Promise(async (resolve, reject) => {
    setTimeout(async () => {
      fs.unlink(configFile, (err) => {});
      // no craches so far
      t.pass()
      resolve()
    }, 500)
  })
});

test.serial('Auth.4.Agent handles updateAuth message with invalid token', async t => {
  let authRequestReceived = false
  const authCallback = (req) => {
    authRequestReceived = true
    connector.sendMessage('updateAuth', {
      idToken: "invalidate_token",
      accessToken: "dummy_access_token",
      state: req.state
    })
  }
  server.on('authRequest', authCallback)

  const configFile = Utils.getDummyEnebularConfig({}, DummyServerPort)
  const ret = await givenAgentConnectedToConnector(t,
      Utils.addNodeRedPort({configFile: configFile}, NodeRedPort))
  agent = ret.agent
  connector = ret.connector

  return await new Promise(async (resolve, reject) => {
    setTimeout(async () => {
      fs.unlink(configFile, (err) => {});
      server.removeListener('authRequest', authCallback)
      t.true(authRequestReceived)
      t.not(agent._agentState, 'authenticated')
      resolve()
    }, 500)
  })
});

test.serial('Auth.5.Agent handles updateAuth message with invalid state', async t => {
  let authRequestReceived = false
  const authCallback = (req) => {
    authRequestReceived = true
    let token = jwt.sign({ nonce: req.nonce }, 'dummy');
    connector.sendMessage('updateAuth', {
      idToken: token,
      accessToken: "dummy_access_token",
      state: "invalidate_state"
    })
  }
  server.on('authRequest', authCallback)

  const configFile = Utils.getDummyEnebularConfig({}, DummyServerPort)
  const ret = await givenAgentConnectedToConnector(t,
      Utils.addNodeRedPort({configFile: configFile}, NodeRedPort))
  agent = ret.agent
  connector = ret.connector

  return await new Promise(async (resolve, reject) => {
    setTimeout(async () => {
      fs.unlink(configFile, (err) => {});
      server.removeListener('authRequest', authCallback)
      t.true(authRequestReceived)
      t.not(agent._agentState, 'authenticated')
      resolve()
    }, 500)
  })
});

test.serial('Auth.6.Agent handles updateAuth message to unauthenticate itself', async t => {
  let authRequestReceived = false

  const ret = await givenAgentAuthenticated(t, server,
      Utils.addNodeRedPort({}, NodeRedPort), DummyServerPort)
  agent = ret.agent
  connector = ret.connector

  const authCallback = (req) => {
    authRequestReceived = true
    // unauthenticate the agent by clearing accessToken
    let token = jwt.sign({ nonce: req.nonce }, 'dummy');
    connector.sendMessage('updateAuth', {
      idToken: token,
      accessToken: "-",
      state: req.state
    })
  }
  server.on('authRequest', authCallback)

  // trigger auth request
  connector.sendMessage('updateAuth', {
    idToken: '-', 
    accessToken: '-',
    state: '-'
  })
  return new Promise(async (resolve, reject) => {
    setTimeout(() => {
      server.removeListener('authRequest', authCallback)
      t.true(authRequestReceived)
      t.is(agent._agentState, 'unauthenticated')
      resolve()
    }, 500)
  })
});

test.serial('Auth.7.Agent retries authentication if fail(auth request)', async t => {
  let authRequestReceived = 0

  const configFile = Utils.getDummyEnebularConfig({connectionId: "return_bad_request"}, DummyServerPort)
  const ret = await givenAgentConnectedToConnector(t,
      Utils.addNodeRedPort({configFile: configFile}, NodeRedPort))
  agent = ret.agent
  connector = ret.connector

  const authCallback = (req) => {
    authRequestReceived++
  }
  server.on('authRequest', authCallback)

  return new Promise(async (resolve, reject) => {
    setTimeout(() => {
      t.is(authRequestReceived, 2)
      resolve()
    }, 26 * 1000)
  })
});

test.serial('Auth.8.Agent retries authentication if fail(no updateAuth message)', async t => {
  let authRequestReceived = 0

  const ret = await givenAgentUnauthenticated(t, server,
      Utils.addNodeRedPort({}, NodeRedPort), DummyServerPort)
  agent = ret.agent
  connector = ret.connector

 const authCallback = (req) => {
    authRequestReceived++
  }
  server.on('authRequest', authCallback)

  return new Promise(async (resolve, reject) => {
    setTimeout(() => {
      t.is(authRequestReceived, 2)
      resolve()
    }, 26 * 1000)
  })
});



