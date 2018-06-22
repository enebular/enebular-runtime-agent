import test from 'ava';
import fs from 'fs'
import jwt from 'jsonwebtoken'
import {Server} from 'net'

import EnebularAgent from '../src/enebular-agent'
import ConnectorService from '../src/connector-service'
import NodeRedAdminApi from './helpers/node-red-admin-api'
import Utils from './helpers/utils'
import DummyServer from './helpers/dummy-server'
import {
  givenAgentConnectedToConnector,
  givenAgentAuthenticated
} from './helpers/agent-helper'

const DummyServerPort = 3005
const NodeRedPort = 4005

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

test.serial('Core.1.No activator config presents, agent connects to connector', t => {
  const configFile = '/tmp/.enebular-config-' + Utils.randomString() + '.json'

  connector = new ConnectorService()
  let agentConfig = {}
  agentConfig['nodeRedDir'] = "../node-red"
  agentConfig['nodeRedCommand'] = "./node_modules/.bin/node-red -p " + NodeRedPort
  agentConfig['configFile'] = configFile

  agent = new EnebularAgent(connector, agentConfig);

  return new Promise(async (resolve, reject) => {
    agent.on('connectorConnect', async () => {
      connector.updateConnectionState(true)
      t.pass()
      resolve();
    })

    await agent.startup();
    connector.updateActiveState(true)
    connector.updateRegistrationState(true, "dummy_deviceId");
    setTimeout(async () => {
      t.fail()
      reject(new Error('no connect request.'))
    }, 1000)
  })
});

test.serial('Core.2.Agent correctly handle register message', async t => {
  const configFile = '/tmp/.enebular-config-' + Utils.randomString() + '.json'
  const ret = await givenAgentConnectedToConnector(t,
      Utils.addNodeRedPort({configFile: configFile}, NodeRedPort))
  agent = ret.agent
  connector = ret.connector
  const config = {
    connectionId: "dummy_connectionId",
    deviceId: "dummy_deviceId",
    authRequestUrl: "http://dummy.authRequestUrl",
    agentManagerBaseUrl: "http://dummy.agentManagerBaseUrl"
  }
  connector.sendMessage('register', config)
  return new Promise(async (resolve, reject) => {
    setTimeout(() => {
      let configFromFile = require(configFile)
      fs.unlink(configFile, (err) => {});

      // The config file should be identical
      t.deepEqual(configFromFile, config)
      t.is(agent._agentState, 'registered')
      resolve()
    }, 500)
  })
});

test.serial('Core.3.Agent attempts to authenticate when received register message', async t => {
  let authRequestReceived = false
  server.on('authRequest', () => {
    console.log("authRequest received.");
    authRequestReceived = true
  })

  const configFile = '/tmp/.enebular-config-' + Utils.randomString() + '.json'
  const ret = await givenAgentConnectedToConnector(t,
      Utils.addNodeRedPort({configFile: configFile}, NodeRedPort))
  agent = ret.agent
  connector = ret.connector
  const config = {
    connectionId: "dummy_connectionId",
    deviceId: "dummy_deviceId",
    authRequestUrl: "http://127.0.0.1:" + DummyServerPort + "/api/v1/token/device",
    agentManagerBaseUrl: "http://dummy.agentManagerBaseUrl"
  }
  // Send register message from connector.
  connector.sendMessage('register', config)
  return new Promise(async (resolve, reject) => {
    setTimeout(() => {
      fs.unlink(configFile, (err) => {});
      t.true(authRequestReceived)
      resolve()
    }, 500)
  })
});

test.serial('Core.4.Agent attempts to authenticate when status become registered', async t => {
  let authRequestReceived = false
  server.on('authRequest', () => {
    console.log("authRequest received.");
    authRequestReceived = true
  })

  // An existing registered config
  const configFile = Utils.getDummyEnebularConfig({}, DummyServerPort)
  const ret = await givenAgentConnectedToConnector(t,
      Utils.addNodeRedPort({configFile: configFile}, NodeRedPort))
  agent = ret.agent
  connector = ret.connector
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      fs.unlink(configFile, (err) => {});
      t.true(authRequestReceived)
      resolve()
    }, 500)
  })
});

test.serial('Core.5.Agent reports status when status changed to authenticated', async t => {
  let notifyStatusReceived = false
  server.on('notifyStatus', (req) => {
    notifyStatusReceived = true
  })

  const ret = await givenAgentAuthenticated(t, server,
      Utils.addNodeRedPort({}, NodeRedPort), DummyServerPort)
  agent = ret.agent
  connector = ret.connector
  t.true(notifyStatusReceived)
});

test.serial('Core.6.Agent enables sending log when status changed to authenticated', async t => {
  let recordLogsReceived = false
  server.on('recordLogs', () => {
    console.log("recordLogs received.");
    recordLogsReceived = true
  })

  const ret = await givenAgentAuthenticated(t, server,
      Utils.addNodeRedPort({}, NodeRedPort), DummyServerPort)
  agent = ret.agent
  connector = ret.connector

  // shut down agent should trigger records-log request
  await agent.shutdown()
  agent = null

  return new Promise((resolve, reject) => {
    setTimeout(() => {
      t.true(recordLogsReceived)
      resolve()
    }, 500)
  })
});

test.serial('Core.7.Agent receives status notification periodically - fast', async t => {
  let notifyStatusReceived = 0 
  server.on('notifyStatus', (req) => {
    notifyStatusReceived++
  })

  const ret = await givenAgentAuthenticated(t, server, Utils.addNodeRedPort({ 
    monitorIntervalFast: 1,
    monitorIntervalFastPeriod: 5
  }, NodeRedPort), DummyServerPort) 
  agent = ret.agent
  connector = ret.connector

  return new Promise(async (resolve, reject) => {
    setTimeout(() => {
      // within 10 seconds, we should only receive 5(fast period) + 1(normal period) = 6 
      t.is(notifyStatusReceived, 6)
      resolve()
    }, 1000 * 8)
  })
});

test.serial('Core.8.Agent receives status notification periodically - normal', async t => {
  let notifyStatusReceived = 0 
  server.on('notifyStatus', (req) => {
    notifyStatusReceived++
  })

  const ret = await givenAgentAuthenticated(t, server, Utils.addNodeRedPort({ 
    monitorIntervalFast: 1,
    monitorIntervalFastPeriod: 2,
    monitorIntervalNormal: 3,
  }, NodeRedPort), DummyServerPort) 
  agent = ret.agent
  connector = ret.connector

  return new Promise(async (resolve, reject) => {
    setTimeout(() => {
      // within 10 seconds, we should only receive 2(fast period) + 3(normal period) = 5 
      t.is(notifyStatusReceived, 5)
      resolve()
    }, 1000 * 8)
  })
});

test.serial('Core.9.Agent stops sending status notification when it is unauthenticated', async t => {
  let authRequestReceived = false
  let notifyStatusReceived = 0 
  server.on('notifyStatus', (req) => {
    notifyStatusReceived++
  })

  const ret = await givenAgentAuthenticated(t, server, Utils.addNodeRedPort({ 
    monitorIntervalFast: 1,
  }, NodeRedPort), DummyServerPort) 
  agent = ret.agent
  connector = ret.connector

  // callback to process unauthentication.
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

  return new Promise(async (resolve, reject) => {
    setTimeout(() => {
      // trigger auth request
      connector.sendMessage('updateAuth', {
        idToken: '-', 
        accessToken: '-',
        state: '-'
      })
    }, 1000 * 3)

    setTimeout(() => {
      // within 6 seconds, we should only receive 4(fast period) 
      t.is(notifyStatusReceived, 4)
      server.removeListener('authRequest', authCallback)
      t.true(authRequestReceived)
      t.is(agent._agentState, 'unauthenticated')
      resolve()
    }, 1000 * 6)
  })
});





