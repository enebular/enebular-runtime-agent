import test from 'ava';
import fs from 'fs'

import EnebularAgent from '../src/enebular-agent'
import ConnectorService from '../src/connector-service'
import NodeRedAdminApi from './helpers/node-red-admin-api'
import Utils from './helpers/utils'
import DummyEnebularServer from './helpers/dummy-enebular-server'

let agent: EnebularAgent
let connector: ConnectorService

test.before(t => {
  process.env.DEBUG = "debug";
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

async function agentConnectedToConnector(t, configFile) {
  connector = new ConnectorService()
  let agentConfig = {}
  agentConfig['nodeRedDir'] = "../node-red"
  agentConfig['nodeRedCommand'] = "./node_modules/.bin/node-red -p 1990"
  agentConfig['configFile'] = configFile

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

test.serial('Agent.1.No activator config presents, agent connects to connector', async t => {
  const configFile = '/tmp/.enebular-config-' + Utils.randomString() + '.json'
  return agentConnectedToConnector(t, configFile);
});

test.serial('Agent.2.Agent correctly handle register message', async t => {
  const configFile = '/tmp/.enebular-config-' + Utils.randomString() + '.json'
  await agentConnectedToConnector(t, configFile);
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

test.serial('Agent.3.Agent correctly handle register message', async t => {
  let server = new DummyEnebularServer()
  await server.start(3001)

  const configFile = '/tmp/.enebular-config-' + Utils.randomString() + '.json'
  await agentConnectedToConnector(t, configFile);
  const config = {
    connectionId: "dummy_connectionId",
    deviceId: "dummy_deviceId",
    authRequestUrl: "http://127.0.0.1:3001/api/v1/token/device",
    agentManagerBaseUrl: "http://dummy.agentManagerBaseUrl"
  }
  connector.sendMessage('register', config)
  return new Promise(async (resolve, reject) => {
    setTimeout(() => {
      fs.unlink(configFile, (err) => {});

      resolve()
    }, 500)
  })
});






