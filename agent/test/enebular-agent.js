import test from 'ava';
import fs from 'fs'
import jwt from 'jsonwebtoken'

import EnebularAgent from '../src/enebular-agent'
import ConnectorService from '../src/connector-service'
import NodeRedAdminApi from './helpers/node-red-admin-api'
import Utils from './helpers/utils'
import DummyEnebularServer from './helpers/dummy-enebular-server'

let agent: EnebularAgent
let connector: ConnectorService
let server: DummyEnebularServer

test.before(async t => {
  process.env.DEBUG = "info";
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

async function givenAgentConnectedToConnector(t: test, agentConfig: EnebularAgentConfig) {
  connector = new ConnectorService()
  let _agentConfig = {}
  _agentConfig['nodeRedDir'] = "../node-red"
  _agentConfig['nodeRedCommand'] = "./node_modules/.bin/node-red -p 1990"

  agentConfig = Object.assign(_agentConfig, agentConfig)
	t.notThrows(() => { agent = new EnebularAgent(connector, agentConfig); }, Error);

  await new Promise(async (resolve, reject) => {
    agent.on('connectorConnect', async () => {
      connector.updateConnectionState(true)
      resolve();
    })

    await agent.startup();
    connector.updateActiveState(true)
    connector.updateRegistrationState(true, "dummy_deviceId");
    setTimeout(async () => {
      reject(new Error('no connect request.'))
    }, 1000)
  })
}

async function givenAgentAuthenticated(t: test, agentConfig: EnebularAgentConfig) {
  let authRequestReceived = false
  server.on('authRequest', (req) => {
    console.log("authRequest received.", req);
    let token = jwt.sign({ nonce: req.nonce }, 'dummy');
    authRequestReceived = true
    connector.sendMessage('updateAuth', {
      idToken: token, 
      accessToken: "dummy_access_token",
      state: req.state
    })
  })

  // An existing registered config
  const configFile = Utils.getDummyEnebularConfig({
    authRequestUrl: "http://127.0.0.1:3001/api/v1/token/device",
    agentManagerBaseUrl: "http://127.0.0.1:3001/api/v1"
  })
  await givenAgentConnectedToConnector(t, Object.assign({configFile: configFile}, agentConfig));
  await new Promise(async (resolve, reject) => {
    setTimeout(async () => {
      fs.unlink(configFile, (err) => {});
      t.true(authRequestReceived)
      resolve()
    }, 500)
  })
}

test.serial('Core.1.No activator config presents, agent connects to connector', async t => {
  const configFile = '/tmp/.enebular-config-' + Utils.randomString() + '.json'
  return givenAgentConnectedToConnector(t, {configFile: configFile});
});

test.serial('Core.2.Agent correctly handle register message', async t => {
  const configFile = '/tmp/.enebular-config-' + Utils.randomString() + '.json'
  await givenAgentConnectedToConnector(t, {configFile: configFile});
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
  await givenAgentConnectedToConnector(t, {configFile: configFile});
  const config = {
    connectionId: "dummy_connectionId",
    deviceId: "dummy_deviceId",
    authRequestUrl: "http://127.0.0.1:3001/api/v1/token/device",
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
  const configFile = Utils.getDummyEnebularConfig({
    authRequestUrl: "http://127.0.0.1:3001/api/v1/token/device"
  })
  await givenAgentConnectedToConnector(t, {configFile: configFile});
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

  await givenAgentAuthenticated(t)
  t.true(notifyStatusReceived)
});

test.serial('Core.6.Agent enables sending log when status changed to authenticated', async t => {
  let recordLogsReceived = false
  server.on('recordLogs', () => {
    console.log("recordLogs received.");
    recordLogsReceived = true
  })

  await givenAgentAuthenticated(t)

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

test.serial('Core.7.Agent should receive status notification periodically - fast', async t => {
  let notifyStatusReceived = 0 
  server.on('notifyStatus', (req) => {
    notifyStatusReceived++
  })

  await givenAgentAuthenticated(t, { 
    monitorIntervalFast: 1,
    monitorIntervalFastPeriod: 5
  })

  return new Promise(async (resolve, reject) => {
    setTimeout(() => {
      // within 10 seconds, we should only receive 5(fast period) + 1(normal period) = 6 
      t.is(notifyStatusReceived, 6)
      resolve()
    }, 1000 * 8)
  })
});

test.serial('Core.8.Agent should receive status notification periodically - normal', async t => {
  let notifyStatusReceived = 0 
  server.on('notifyStatus', (req) => {
    notifyStatusReceived++
  })

  await givenAgentAuthenticated(t, { 
    monitorIntervalFast: 1,
    monitorIntervalFastPeriod: 2,
    monitorIntervalNormal: 3,
  })

  return new Promise(async (resolve, reject) => {
    setTimeout(() => {
      // within 10 seconds, we should only receive 2(fast period) + 3(normal period) = 5 
      t.is(notifyStatusReceived, 5)
      resolve()
    }, 1000 * 8)
  })
});





