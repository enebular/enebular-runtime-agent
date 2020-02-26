/* @flow */
import test from 'ava'
import fs from 'fs-extra'
import path from 'path'
import { Server } from 'net'
import EnebularAgent from '../src/enebular-agent'
import ConnectorService from '../src/connector-service'
import Utils from './helpers/utils'
import DummyServer from './helpers/dummy-server'
import DummyServerConfig from './helpers/dummy-server-config'
import { createConnectedAgent, agentCleanup } from './helpers/agent-helper'

const DummyServerPort = 3005
const NodeRedPort = 4005

let agent: EnebularAgent
let server: DummyServer
let http: Server

test.before(async t => {
  process.env.ENEBULAR_TEST = true
  process.env.DEBUG = 'debug'
  server = new DummyServer()
  http = await server.start(DummyServerPort)
})

test.after(t => {
  http.close()
})

test.afterEach.always('cleanup listener', t => {
  server.removeAllListeners('authRequest')
  server.removeAllListeners('recordLogs')
})

test.afterEach.always('cleanup', async t => {
  await agentCleanup(agent, NodeRedPort)
})

test.serial(
  'Core.1: No activator config present, agent connects to connector',
  t => {
    const configFile = '/tmp/.enebular-config-' + Utils.randomString() + '.json'
    const connector = new ConnectorService(() => {
      connector.updateActiveState(true)
      connector.updateRegistrationState(true, 'dummy_deviceId')
    })
    let agentConfig = Utils.createDefaultAgentConfig(NodeRedPort)
    agentConfig['ENEBULAR_CONFIG_PATH'] = configFile

    agent = new EnebularAgent({
      portBasePath: path.resolve(__dirname, '../'),
      connector: connector,
      config: agentConfig
    })

    return new Promise(async (resolve, reject) => {
      agent.on('connectorConnect', async () => {
        t.pass()
        resolve()
      })

      await agent.startup()
      setTimeout(async () => {
        t.fail()
        reject(new Error('no connect request.'))
      }, 1000)
    })
  }
)

test.serial('Core.2: Agent correctly handle register message', async t => {
  const configFile = '/tmp/.enebular-config-' + Utils.randomString() + '.json'
  const ret = await createConnectedAgent(
    t,
    Utils.addNodeRedPortToConfig(
      { ENEBULAR_CONFIG_PATH: configFile },
      NodeRedPort
    )
  )
  agent = ret.agent
  const config = {
    connectionId: 'dummy_connectionId',
    deviceId: 'dummy_deviceId',
    authRequestUrl: 'http://dummy.authRequestUrl',
    agentManagerBaseUrl: 'http://dummy.agentManagerBaseUrl'
  }
  ret.connector.sendMessage('register', config)
  return new Promise(async (resolve, reject) => {
    setTimeout(() => {
      let configFromFile = require(configFile)
      fs.unlink(configFile, err => {
        err = null
      })

      // The config file should be identical
      t.deepEqual(configFromFile, config)
      t.is(agent._agentState, 'registered')
      resolve()
    }, 500)
  })
})

test.serial(
  'Core.3: Agent attempts to authenticate when received register message',
  async t => {
    let authRequestReceived = false
    server.on('authRequest', () => {
      console.log('authRequest received.')
      authRequestReceived = true
    })

    const configFile = '/tmp/.enebular-config-' + Utils.randomString() + '.json'
    const ret = await createConnectedAgent(
      t,
      Utils.addNodeRedPortToConfig(
        { ENEBULAR_CONFIG_PATH: configFile },
        NodeRedPort
      )
    )
    agent = ret.agent
    const config = {
      connectionId: 'dummy_connectionId',
      deviceId: 'dummy_deviceId',
      authRequestUrl:
        'http://127.0.0.1:' +
        DummyServerPort +
        DummyServerConfig.authenticationURL,
      agentManagerBaseUrl: 'http://dummy.agentManagerBaseUrl'
    }
    // Send register message from connector.
    ret.connector.sendMessage('register', config)
    return new Promise(async (resolve, reject) => {
      setTimeout(() => {
        fs.unlink(configFile, err => {
          err = null
        })
        t.true(authRequestReceived)
        resolve()
      }, 500)
    })
  }
)

test.serial(
  'Core.4: Agent attempts to authenticate when status become registered',
  async t => {
    let authRequestReceived = false
    server.on('authRequest', () => {
      console.log('authRequest received.')
      authRequestReceived = true
    })

    // An existing registered config
    const configFile = Utils.createDummyEnebularConfig({}, DummyServerPort)
    const ret = await createConnectedAgent(
      t,
      Utils.addNodeRedPortToConfig(
        { ENEBULAR_CONFIG_PATH: configFile },
        NodeRedPort
      )
    )
    agent = ret.agent
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        fs.unlink(configFile, err => {
          err = null
        })
        t.true(authRequestReceived)
        resolve()
      }, 500)
    })
  }
)
