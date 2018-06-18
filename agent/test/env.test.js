import test from 'ava';

import EnebularAgent from '../src/enebular-agent'
import ConnectorService from '../src/connector-service'
import NodeRedAdminApi from './helpers/node-red-admin-api'
import Utils from './helpers/utils'

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

test.serial('Env.1.Agent starts if node-red path is valid', async t => {
  let api: NodeRedAdminApi
  let agentConfig = {}
  agentConfig['nodeRedDir'] = "../node-red"
  agentConfig['nodeRedCommand'] = "./node_modules/.bin/node-red -p 1990"

  connector = new ConnectorService()
	t.notThrows(() => { agent = new EnebularAgent(connector, agentConfig); }, Error);
  await agent.startup();

  api = new NodeRedAdminApi("http://127.0.0.1:1990");
  const settings = await api.getSettings();
  t.truthy(settings.version)
  await agent.shutdown();
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
  agentConfig['nodeRedCommand'] = "./node_modules/.bin/node-red -p 1980"

  connector = new ConnectorService()
	t.notThrows(() => { agent = new EnebularAgent(connector, agentConfig); }, Error);
  await agent.startup();

  console.log("http request");
  api = new NodeRedAdminApi("http://127.0.0.1:1980");
  const settings = await api.getSettings();
  t.truthy(settings.version)
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

test.serial('Env.7. Agent starts normally with no config file', async t => {
  let configFileName = '/tmp/.enebular-config-' + Utils.randomString() + '.json';
  console.log("config file name:", configFileName)

  connector = new ConnectorService()
  let agentConfig = {}
  agentConfig['nodeRedDir'] = "../node-red"
  agentConfig['configFile'] = configFileName
  agentConfig['nodeRedCommand'] = "./node_modules/.bin/node-red -p 1990"

	t.notThrows(() => { agent = new EnebularAgent(connector, agentConfig); }, Error);

  return new Promise(async (resolve, reject) => {
    await agent.startup();
    connector.updateActiveState(true)
    connector.updateRegistrationState(true, "dummy")
    setTimeout(async () => {
      console.log("config file name:", agent._agentState)
      if (agent._agentState !== 'unregistered') {
        reject(new Error('agent status is not unregistered.'))
      }
      else {
        resolve();
      }
    }, 500)
  })
});




