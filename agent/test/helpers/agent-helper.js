import test from 'ava';
import fs from 'fs'
import jwt from 'jsonwebtoken'

import EnebularAgent from '../../src/enebular-agent'
import ConnectorService from '../../src/connector-service'
import DummyEnebularServer from './dummy-enebular-server'
import Utils from './utils'

export async function givenAgentConnectedToConnector(t: test, agentConfig: EnebularAgentConfig) {
  let connector = new ConnectorService()
  let _agentConfig = {}
  _agentConfig['nodeRedDir'] = "../node-red"
  _agentConfig['nodeRedCommand'] = "./node_modules/.bin/node-red -p 1990"

  agentConfig = Object.assign(_agentConfig, agentConfig)
  let agent = new EnebularAgent(connector, agentConfig);

  return await new Promise(async (resolve, reject) => {
    agent.on('connectorConnect', async () => {
      connector.updateConnectionState(true)
      resolve({agent: agent, connector: connector});
    })

    await agent.startup();
    connector.updateActiveState(true)
    connector.updateRegistrationState(true, "dummy_deviceId");
    setTimeout(async () => {
      reject(new Error('no connect request.'))
    }, 1000)
  })
}

export async function givenAgentAuthenticated(t: test,
    server: DummyEnebularServer, agentConfig: EnebularAgentConfig) {
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
  const {agent, connector} = await givenAgentConnectedToConnector(t, Object.assign({configFile: configFile}, agentConfig));
  return await new Promise(async (resolve, reject) => {
    setTimeout(async () => {
      fs.unlink(configFile, (err) => {});
      t.true(authRequestReceived)
      resolve({agent: agent, connector: connector})
    }, 500)
  })
}

export async function givenAgentUnauthenticated(t: test,
    server: DummyEnebularServer, agentConfig: EnebularAgentConfig) {
  // An existing registered config
  const configFile = Utils.getDummyEnebularConfig({
    authRequestUrl: "http://127.0.0.1:3001/api/v1/token/device",
    agentManagerBaseUrl: "http://127.0.0.1:3001/api/v1"
  })
  return await givenAgentConnectedToConnector(t, Object.assign({configFile: configFile}, agentConfig));
}
