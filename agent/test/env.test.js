import test from 'ava';
import fs from 'fs'

import EnebularAgent from '../src/enebular-agent'
import ConnectorService from '../src/connector-service'
import NodeRedAdminApi from './helpers/node-red-admin-api'
import Utils from './helpers/utils'
import {
  nodeRedIsAlive
} from './helpers/agent-helper'

let agent: EnebularAgent
let connector: ConnectorService

test.before(t => {
  process.env.DEBUG = "info";
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

test.serial('Env.1.Agent starts if node-red path is valid', async t => {
  let api: NodeRedAdminApi
  let agentConfig = {}
  agentConfig['nodeRedDir'] = "../node-red"
  agentConfig['nodeRedCommand'] = "./node_modules/.bin/node-red -p 30001"

  connector = new ConnectorService()
	t.notThrows(() => { agent = new EnebularAgent(connector, agentConfig); }, Error);
  await agent.startup();
  connector.updateActiveState(true)

  await nodeRedIsAlive(30001, 3000).catch((err) => {
    t.fail()
  })
});

test.serial('Env.2.Agent fails to start if node-red path is invalid', t => {
  connector = new ConnectorService()
  let agentConfig = {}
  agentConfig['nodeRedDir'] = "../node-red-invalid"
  agentConfig['configFile'] = '.enebular-config.json'

	t.throws(() => { new EnebularAgent(connector, agentConfig); }, Error);
});

test.serial('Env.3.Agent fails to start if node-red data path is invalid', t => {
  connector = new ConnectorService()
  let agentConfig = {}
  agentConfig['nodeRedDir'] = "../node-red"
  agentConfig['nodeRedDataDir'] = "../node-red-data-invalid"
  agentConfig['configFile'] = '.enebular-config.json'

	t.throws(() => { new EnebularAgent(connector, agentConfig); }, Error);
});

test.serial('Env.4.Agent starts if config file path is invalid', t => {
  connector = new ConnectorService()
  let agentConfig = {}
  agentConfig['nodeRedDir'] = "../node-red"
  agentConfig['configFile'] = '/tmp/invalid-path/file'
  agentConfig['nodeRedCommand'] = "./node_modules/.bin/node-red -p 1990"

	t.notThrows(() => { agent = new EnebularAgent(connector, agentConfig); }, Error);

  return new Promise(async (resolve, reject) => {
    agent.on('connectorConnect', async () => {
      resolve();
    })

    await agent.startup();
    connector.updateActiveState(true)
    connector.updateRegistrationState(true, "dummy")
    setTimeout(async () => {
      reject(new Error('no connect request.'))
    }, 1000)
  })
});

test.serial('Env.5.Agent takes nodeRedCommand to launch node-red', async t => {
  let api: NodeRedAdminApi
  let agentConfig = {}
  agentConfig['nodeRedDir'] = "../node-red"
  agentConfig['nodeRedCommand'] = "./node_modules/.bin/node-red -p 30000"

  connector = new ConnectorService()
	t.notThrows(() => { agent = new EnebularAgent(connector, agentConfig); }, Error);
  await agent.startup();
  connector.updateActiveState(true)

  await nodeRedIsAlive(30000, 3000).catch((err) => {
    t.fail()
  })
});

test.serial('Env.6.Agent fails to start if command to launch node-red is invalid', async t => {
  connector = new ConnectorService()
  let agentConfig = {}
  agentConfig['nodeRedDir'] = "../node-red"
  agentConfig['nodeRedCommand'] = "./node_modules/.bin/node-red-invalid"

	t.notThrows(() => { agent = new EnebularAgent(connector, agentConfig); }, Error);
  await agent.startup()
  .then(function(error) {
    t.fail();
  })
  .catch(function(error) {
    console.log(error);
    t.pass();
  });
});

test.serial('Env.7.Agent starts normally with no config file', async t => {
  let configFileName = '/tmp/.enebular-config-' + Utils.randomString() + '.json';

  connector = new ConnectorService()
  let agentConfig = {}
  agentConfig['nodeRedDir'] = "../node-red"
  agentConfig['configFile'] = configFileName
  agentConfig['nodeRedCommand'] = "./node_modules/.bin/node-red -p 1990"

	t.notThrows(() => { agent = new EnebularAgent(connector, agentConfig); }, Error);

  return new Promise(async (resolve, reject) => {
    await agent.startup();
    connector.updateActiveState(true)
    setTimeout(() => {
      fs.unlink(agentConfig['configFile'], (err) => {});
      console.log("_agentState is:", agent._agentState)
      t.is(agent._agentState, 'unregistered')
      resolve();
    }, 500)
  })
});

test.serial('Env.8.Agent accepts all supported config items', async t => {
  connector = new ConnectorService()
  let agentConfig = {}
  agentConfig['nodeRedDir'] = "../node-red"
  agentConfig['configFile'] = Utils.getDummyEnebularConfig({});
  agentConfig['nodeRedCommand'] = "./node_modules/.bin/node-red -p 1990"

	t.notThrows(() => { agent = new EnebularAgent(connector, agentConfig); }, Error);

  return new Promise(async (resolve, reject) => {
    await agent.startup();
    connector.updateActiveState(true)
    setTimeout(() => {
      fs.unlink(agentConfig['configFile'], (err) => {});

      console.log("_agentState is:", agent._agentState)
      t.is(agent._agentState, 'registered')
      t.is(agent._connectionId, 'dummy_connectionId')
      t.is(agent._deviceId, 'dummy_deviceId')
      t.is(agent._authRequestUrl, 'http://127.0.0.1:3001/api/v1/token/device')
      t.is(agent._agentManagerBaseUrl, 'http://127.0.0.1:3001/api/v1')
      resolve();
    }, 500)
  })
});

test.serial('Env.9.Agent handles an invalid config file', async t => {
  connector = new ConnectorService()
  let agentConfig = {}
  agentConfig['nodeRedDir'] = "../node-red"
  agentConfig['configFile'] = Utils.getBrokenEnebularConfig();
  agentConfig['nodeRedCommand'] = "./node_modules/.bin/node-red -p 1990"

	t.notThrows(() => { agent = new EnebularAgent(connector, agentConfig); }, Error);

  return new Promise(async (resolve, reject) => {
    await agent.startup();
    connector.updateActiveState(true)
    setTimeout(() => {
      fs.unlink(agentConfig['configFile'], (err) => {});
      t.is(agent._agentState, 'unregistered')
      resolve();
    }, 500)
  })
});


