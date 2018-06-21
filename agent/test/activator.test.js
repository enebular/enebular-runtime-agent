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

const DummyServerPort = 3003
const NodeRedPort = 4003

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

test.serial('Activator.1.No enebular activator config, activator shall not be enabled', async t => {
  const configFile = '/tmp/.enebular-config-' + Utils.randomString() + '.json'
  const ret = await givenAgentConnectedToConnector(t, 
     Utils.addNodeRedPort({configFile: configFile}, NodeRedPort))
  agent = ret.agent
  connector = ret.connector

  t.false(agent._activator._enabled)
});

test.serial('Activator.2.Activation config is invalid, agent stops.', async t => {
  process.env.ACTIVATOR_CONFIG_PATH = Utils.getBrokenActivationConfig()

  const configFile = '/tmp/.enebular-config-' + Utils.randomString() + '.json'
  connector = new ConnectorService()
  let agentConfig = {}
  agentConfig['nodeRedDir'] = "../node-red"
  agentConfig['nodeRedCommand'] = "./node_modules/.bin/node-red -p " + NodeRedPort
  agentConfig['configFile'] = configFile

	t.throws(() => { new EnebularAgent(connector, agentConfig); }, Error);
});

test.serial('Activator.3.Activation config is valid, try to verify license.', async t => {
  process.env.ACTIVATOR_CONFIG_PATH = Utils.getDummyEnebularActivationConfig({}, DummyServerPort)
  let verifyLicenseReceived = false
  const verifyCallback = (req) => {
    verifyLicenseReceived = true
  }
  server.on('verifyLicense', verifyCallback)

  const configFile = '/tmp/.enebular-config-' + Utils.randomString() + '.json'
  const ret = await givenAgentStarted(t,
     Utils.addNodeRedPort({configFile: configFile}, NodeRedPort))
  agent = ret.agent
  connector = ret.connector

  return new Promise(async (resolve, reject) => {
    setTimeout(() => {
      server.removeListener('verifyLicense', verifyCallback)
      t.true(verifyLicenseReceived)
      resolve()
    }, 500)
  })
});

test.serial('Activator.4.Activation config is valid, agent has been registered, no verify license request.', async t => {
  process.env.ACTIVATOR_CONFIG_PATH = Utils.getDummyEnebularActivationConfig({}, DummyServerPort)
  let verifyLicenseReceived = false
  const verifyCallback = (req) => {
    verifyLicenseReceived = true
  }
  server.on('verifyLicense', verifyCallback)

  const configFile = Utils.getDummyEnebularConfig({}, DummyServerPort)
  const ret = await givenAgentConnectedToConnector(t,
     Utils.addNodeRedPort({configFile: configFile}, NodeRedPort))
  agent = ret.agent
  connector = ret.connector

  return new Promise(async (resolve, reject) => {
    setTimeout(() => {
      server.removeListener('verifyLicense', verifyCallback)
      t.false(verifyLicenseReceived)
      resolve()
    }, 500)
  })
});

test.serial('Activator.5.License is invalid, no activate license request, agent stays in unregistered.', async t => {
  process.env.ACTIVATOR_CONFIG_PATH = Utils.getDummyEnebularActivationConfigInvalidKey(DummyServerPort)
  let verifyLicenseReceived = false
  const verifyCallback = (req) => {
    verifyLicenseReceived = true
  }
  server.on('verifyLicense', verifyCallback)

  let activateLicenseReceived = false
  const activateCallback = (req) => {
    activateLicenseReceived = true
  }
  server.on('activateLicense', activateCallback)

  const configFile = '/tmp/.enebular-config-' + Utils.randomString() + '.json'
  const ret = await givenAgentStarted(t,
     Utils.addNodeRedPort({configFile: configFile}, NodeRedPort))
  agent = ret.agent
  connector = ret.connector

  return new Promise(async (resolve, reject) => {
    setTimeout(() => {
      server.removeListener('verifyLicense', verifyCallback)
      server.removeListener('activateLicense', activateCallback)
      t.true(verifyLicenseReceived)
      t.false(activateLicenseReceived)
      t.is(agent._agentState, 'unregistered')
      resolve()
    }, 500)
  })
});

test.serial('Activator.6.License is valid.', async t => {
  process.env.ACTIVATOR_CONFIG_PATH = Utils.getDummyEnebularActivationConfig({}, DummyServerPort)
  let verifyLicenseReceived = false
  let activateLicenseReceived = false
  let connectorConnectReceived = false

  const verifyCallback = (req) => {
    verifyLicenseReceived = true
  }
  server.on('verifyLicense', verifyCallback)

  const activateCallback = (req) => {
    activateLicenseReceived = true
  }
  server.on('activateLicense', activateCallback)

  const configFile = '/tmp/.enebular-config-' + Utils.randomString() + '.json'
  const ret = await givenAgentStarted(t,
     Utils.addNodeRedPort({configFile: configFile}, NodeRedPort))
  agent = ret.agent
  connector = ret.connector

  agent.on('connectorRegister', () => {
    connector.updateRegistrationState(true, "dummy_deviceId")
  })

  agent.on('connectorConnect', () => {
    connector.updateConnectionState(true)
    connectorConnectReceived = true
  })

  return new Promise(async (resolve, reject) => {
    setTimeout(() => {
      server.removeListener('verifyLicense', verifyCallback)
      server.removeListener('activateLicense', activateCallback)
      t.true(verifyLicenseReceived)
      t.true(activateLicenseReceived)
      t.true(connectorConnectReceived)
      t.is(agent._agentState, 'registered')
      t.is(agent._connectionId, 'dummy_connectionId')
      t.is(agent._deviceId, 'dummy_deviceId')
      t.is(agent._authRequestUrl, 'http://127.0.0.1:3001/api/v1/token/device')
      t.is(agent._agentManagerBaseUrl, 'http://127.0.0.1:3001/api/v1')
      resolve()
    }, 500)
  })
});


