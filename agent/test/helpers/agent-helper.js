/* @flow */
import test from 'ava'
import fs from 'fs'
import path from 'path'
import jwt from 'jsonwebtoken'

import EnebularAgent from '../../src/enebular-agent'
import ConnectorService from '../../src/connector-service'
import DummyEnebularServer from './dummy-server'
import NodeRedAdminApi from './node-red-admin-api'
import Utils from './utils'

export async function createStartedAgent(
  t: test,
  agentConfig: EnebularAgentConfig
) {
  let connector = new ConnectorService(() => {
    connector.updateActiveState(true)
  })

  agentConfig = Object.assign(Utils.createDefaultAgentConfig(1990), agentConfig)
  let agent = new EnebularAgent({
      portBasePath: path.resolve(__dirname, '../'),
      connector: connector,
      config: agentConfig
  })

  await agent.startup()
  return { agent: agent, connector: connector }
}

export async function createConnectedAgent(
  t: test,
  agentConfig: EnebularAgentConfig
) {
  let connector = new ConnectorService(() => {
    connector.updateActiveState(true)
    connector.updateRegistrationState(true, 'dummy_deviceId')
  })
  agentConfig = Object.assign(Utils.createDefaultAgentConfig(1990), agentConfig)
  let agent = new EnebularAgent({
      portBasePath: path.resolve(__dirname, '../'),
      connector: connector,
      config: agentConfig
  })

  return new Promise(async (resolve, reject) => {
    agent.on('connectorConnect', async () => {
      connector.updateConnectionState(true)
      resolve({ agent: agent, connector: connector })
    })

    await agent.startup(agentConfig)
    setTimeout(async () => {
      reject(new Error('no connect request.'))
    }, 1000)
  })
}

export async function createAuthenticatedAgent(
  t: test,
  server: DummyEnebularServer,
  agentConfig: EnebularAgentConfig,
  port: number
) {
  let authRequestReceived = false
  const authCallback = req => {
    // console.log("authRequest received.", req);
    let token = jwt.sign({ nonce: req.nonce }, 'dummy')
    authRequestReceived = true
    connector.sendMessage('updateAuth', {
      idToken: token,
      accessToken: 'dummy_access_token',
      state: req.state
    })
  }
  server.on('authRequest', authCallback)

  // An existing registered config
  const configFile = Utils.createDummyEnebularConfig({}, port)
  const { agent, connector } = await createConnectedAgent(
    t,
    Object.assign({ ENEBULAR_CONFIG_PATH: configFile }, agentConfig)
  )
  return new Promise(async (resolve, reject) => {
    setTimeout(async () => {
      fs.unlink(configFile, err => {
        err = null
      })
      t.true(authRequestReceived)
      server.removeListener('authRequest', authCallback)
      resolve({ agent: agent, connector: connector })
    }, 500)
  })
}

export async function createUnauthenticatedAgent(
  t: test,
  server: DummyEnebularServer,
  agentConfig: EnebularAgentConfig,
  port: number
) {
  // An existing registered config
  const configFile = Utils.createDummyEnebularConfig({}, port)
  return createConnectedAgent(
    t,
    Object.assign({ ENEBULAR_CONFIG_PATH: configFile }, agentConfig)
  )
}

export function nodeRedIsAlive(port, timeout) {
  return new Promise((resolve, reject) => {
    setTimeout(async () => {
      const api = new NodeRedAdminApi('http://127.0.0.1:' + port)
      const settings = await api.getSettings()
      resolve(!!settings)
    }, timeout || 500)
  })
}
