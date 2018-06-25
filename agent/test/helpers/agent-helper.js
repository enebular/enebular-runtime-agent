/* @flow */
import test from 'ava'
import fs from 'fs'
import jwt from 'jsonwebtoken'

import EnebularAgent from '../../src/enebular-agent'
import ConnectorService from '../../src/connector-service'
import DummyEnebularServer from './dummy-server'
import NodeRedAdminApi from './node-red-admin-api'
import Utils from './utils'

export async function givenAgentStarted(
  t: test,
  agentConfig: EnebularAgentConfig
) {
  let connector = new ConnectorService()
  let _agentConfig = {}
  _agentConfig['nodeRedDir'] = '../node-red'
  _agentConfig['nodeRedCommand'] = './node_modules/.bin/node-red -p 1990'

  agentConfig = Object.assign(_agentConfig, agentConfig)
  let agent = new EnebularAgent(connector, agentConfig)

  await agent.startup()
  connector.updateActiveState(true)
  return { agent: agent, connector: connector }
}

export async function givenAgentConnectedToConnector(
  t: test,
  agentConfig: EnebularAgentConfig
) {
  let connector = new ConnectorService()
  let _agentConfig = {}
  _agentConfig['nodeRedDir'] = '../node-red'
  _agentConfig['nodeRedCommand'] = './node_modules/.bin/node-red -p 1990'

  agentConfig = Object.assign(_agentConfig, agentConfig)
  let agent = new EnebularAgent(connector, agentConfig)

  return new Promise(async (resolve, reject) => {
    agent.on('connectorConnect', async () => {
      connector.updateConnectionState(true)
      resolve({ agent: agent, connector: connector })
    })

    await agent.startup()
    connector.updateActiveState(true)
    connector.updateRegistrationState(true, 'dummy_deviceId')
    setTimeout(async () => {
      reject(new Error('no connect request.'))
    }, 1000)
  })
}

export async function givenAgentAuthenticated(
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
  const { agent, connector } = await givenAgentConnectedToConnector(
    t,
    Object.assign({ configFile: configFile }, agentConfig)
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

export async function givenAgentUnauthenticated(
  t: test,
  server: DummyEnebularServer,
  agentConfig: EnebularAgentConfig,
  port: number
) {
  // An existing registered config
  const configFile = Utils.createDummyEnebularConfig({}, port)
  return givenAgentConnectedToConnector(
    t,
    Object.assign({ configFile: configFile }, agentConfig)
  )
}

export function nodeRedIsAlive(port, timeout, checkDead) {
  return new Promise((resolve, reject) => {
    setTimeout(async () => {
      const api = new NodeRedAdminApi('http://127.0.0.1:' + port)
      const settings = await api.getSettings()

      if (checkDead ? !settings : settings) {
        resolve()
      } else {
        reject(new Error('Node RED server is ', checkDead ? "dead" : "alive"))
      }
    }, timeout || 500)
  })
}

export function nodeRedIsDead(port, timeout) {
  return nodeRedIsAlive(port, timeout, true)
}
