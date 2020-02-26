/* @flow */
import test from 'ava'
import path from 'path'
import { Server } from 'net'

import EnebularAgent from '../src/enebular-agent'
import ConnectorService from '../src/connector-service'
import Utils from './helpers/utils'
import DummyServer from './helpers/dummy-server'
import DummyServerConfig from './helpers/dummy-server-config'
import {
  createConnectedAgent,
  createStartedAgent,
  agentCleanup
} from './helpers/agent-helper'

const DummyServerPort = 3003
const NodeRedPort = 4003

let agent: EnebularAgent
let server: DummyServer
let http: Server

test.before(async t => {
  process.env.ENEBULAR_TEST = true
  process.env.DEBUG = 'info'
  server = new DummyServer()
  http = await server.start(DummyServerPort)
})

test.after(t => {
  http.close()
})

test.afterEach.always('cleanup listener', t => {
  server.removeAllListeners('verifyLicense')
  server.removeAllListeners('activateLicense')
})

test.afterEach.always('cleanup', async t => {
  await agentCleanup(agent, NodeRedPort)
})

test.serial(
  'Activator.1: No enebular activator config, activator shall not be enabled',
  async t => {
    const configFile = '/tmp/.enebular-config-' + Utils.randomString() + '.json'
    const ret = await createConnectedAgent(
      t,
      Utils.addNodeRedPortToConfig(
        { ENEBULAR_CONFIG_PATH: configFile },
        NodeRedPort
      )
    )
    agent = ret.agent

    t.false(agent._activator._enabled)
  }
)

test.serial(
  'Activator.2: Activation config is invalid, agent stops.',
  async t => {
    process.env.ACTIVATOR_CONFIG_PATH = Utils.createBrokenEnebularActivationConfig()

    const configFile = '/tmp/.enebular-config-' + Utils.randomString() + '.json'
    const connector = new ConnectorService()
    let agentConfig = Utils.createDefaultAgentConfig(NodeRedPort)
    agentConfig['ENEBULAR_CONFIG_PATH'] = configFile

    agent = new EnebularAgent({
      portBasePath: path.resolve(__dirname, '../'),
      connector: connector,
      config: agentConfig
    })
    await t.throwsAsync(agent.startup(), Error)
  }
)

test.serial(
  'Activator.3: Activation config is valid, try to verify license.',
  async t => {
    process.env.ACTIVATOR_CONFIG_PATH = Utils.createDummyEnebularActivationConfig(
      {},
      DummyServerPort
    )
    let verifyLicenseReceived = false
    const verifyCallback = req => {
      verifyLicenseReceived = true
    }
    server.on('verifyLicense', verifyCallback)

    const configFile = '/tmp/.enebular-config-' + Utils.randomString() + '.json'
    const ret = await createStartedAgent(
      t,
      Utils.addNodeRedPortToConfig(
        { ENEBULAR_CONFIG_PATH: configFile },
        NodeRedPort
      )
    )
    agent = ret.agent

    return new Promise(async (resolve, reject) => {
      setTimeout(() => {
        server.removeListener('verifyLicense', verifyCallback)
        t.true(verifyLicenseReceived)
        resolve()
      }, 500)
    })
  }
)

test.serial(
  'Activator.4: Activation config is valid, agent has been registered, no verify license request.',
  async t => {
    process.env.ACTIVATOR_CONFIG_PATH = Utils.createDummyEnebularActivationConfig(
      {},
      DummyServerPort
    )
    let verifyLicenseReceived = false
    const verifyCallback = req => {
      verifyLicenseReceived = true
    }
    server.on('verifyLicense', verifyCallback)

    const configFile = Utils.createDummyEnebularConfig({}, DummyServerPort)
    const ret = await createConnectedAgent(
      t,
      Utils.addNodeRedPortToConfig(
        { ENEBULAR_CONFIG_PATH: configFile },
        NodeRedPort
      )
    )
    agent = ret.agent

    return new Promise(async (resolve, reject) => {
      setTimeout(() => {
        server.removeListener('verifyLicense', verifyCallback)
        t.false(verifyLicenseReceived)
        resolve()
      }, 500)
    })
  }
)

test.serial(
  'Activator.5: License is invalid, no activate license request, agent stays in unregistered.',
  async t => {
    process.env.ACTIVATOR_CONFIG_PATH = Utils.createDummyEnebularActivationConfigInvalidKey(
      DummyServerPort
    )
    let verifyLicenseReceived = false
    const verifyCallback = req => {
      verifyLicenseReceived = true
    }
    server.on('verifyLicense', verifyCallback)

    let activateLicenseReceived = false
    const activateCallback = req => {
      activateLicenseReceived = true
    }
    server.on('activateLicense', activateCallback)

    const configFile = '/tmp/.enebular-config-' + Utils.randomString() + '.json'
    const ret = await createStartedAgent(
      t,
      Utils.addNodeRedPortToConfig(
        { ENEBULAR_CONFIG_PATH: configFile },
        NodeRedPort
      )
    )
    agent = ret.agent

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
  }
)

test.serial('Activator.6: License is valid.', async t => {
  process.env.ACTIVATOR_CONFIG_PATH = Utils.createDummyEnebularActivationConfig(
    {},
    DummyServerPort
  )
  let verifyLicenseReceived = false
  let activateLicenseReceived = false
  let connectorConnectReceived = false

  const verifyCallback = req => {
    verifyLicenseReceived = true
  }
  server.on('verifyLicense', verifyCallback)

  const activateCallback = req => {
    activateLicenseReceived = true
  }
  server.on('activateLicense', activateCallback)

  const configFile = '/tmp/.enebular-config-' + Utils.randomString() + '.json'

  const connector = new ConnectorService(() => {
    connector.updateActiveState(true)
  })
  const agentConfig = Object.assign(
    Utils.createDefaultAgentConfig(1990),
    Utils.addNodeRedPortToConfig(
      { ENEBULAR_CONFIG_PATH: configFile },
      NodeRedPort
    )
  )
  agent = new EnebularAgent({
    portBasePath: path.resolve(__dirname, '../'),
    connector: connector,
    config: agentConfig
  })

  agent.on('connectorRegister', () => {
    connector.updateRegistrationState(true, 'dummy_deviceId')
  })

  agent.on('connectorConnect', () => {
    connector.updateConnectionState(true)
    connectorConnectReceived = true
  })

  await agent.startup()

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
      t.is(
        agent._authRequestUrl,
        'http://127.0.0.1:' +
          DummyServerPort +
          DummyServerConfig.authenticationURL
      )
      t.is(
        agent._agentManagerBaseUrl,
        'http://127.0.0.1:' + DummyServerPort + '/agent-manager'
      )
      resolve()
    }, 500)
  })
})
