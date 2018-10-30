/* @flow */
import test from 'ava'
import fs from 'fs'
import path from 'path'

import EnebularAgent from '../src/enebular-agent'
import ConnectorService from '../src/connector-service'
import Utils from './helpers/utils'
import { 
  nodeRedIsAlive,
  agentCleanup
} from './helpers/agent-helper'
import DummyServerConfig from './helpers/dummy-server-config'

const DummyServerPort = 3001
// const NodeRedPort = 4001

let agent: EnebularAgent

test.before(t => {
  process.env.ENEBULAR_TEST = true
  process.env.DEBUG = 'info'
})

test.afterEach.always('cleanup', async t => {
  await agentCleanup(agent)
})

test.serial('Env.1: Agent starts if node-red path is valid', async t => {
  let agentConfig = Utils.createDefaultAgentConfig(30001)

  const connector = new ConnectorService(() => {
    connector.updateActiveState(true)
  })
  agent = new EnebularAgent({
    portBasePath: path.resolve(__dirname, '../'),
    connector: connector,
    config: agentConfig
  })
  t.notThrows(async () => {
    await agent.startup()
  }, Error)
  t.true(await nodeRedIsAlive(30001))
})

test.serial(
  'Env.2: Agent fails to start if node-red path is invalid',
  async t => {
    const connector = new ConnectorService()
    let agentConfig = Utils.createDefaultAgentConfig(1990)

    agentConfig['NODE_RED_DIR'] = '../node-red-invalid'
    agentConfig['ENEBULAR_CONFIG_PATH'] = '.enebular-config.json'

    agent = new EnebularAgent({
      portBasePath: path.resolve(__dirname, '../'),
      connector: connector,
      config: agentConfig
    })
    await t.throws(agent.startup(), Error)
  }
)

test.serial(
  'Env.3: Agent fails to start if node-red data path is invalid',
  async t => {
    const connector = new ConnectorService()
    let agentConfig = Utils.createDefaultAgentConfig(1990)
    agentConfig['NODE_RED_DATA_DIR'] = '../node-red-data-invalid'
    agentConfig['ENEBULAR_CONFIG_PATH'] = '.enebular-config.json'

    agent = new EnebularAgent({
      portBasePath: path.resolve(__dirname, '../'),
      connector: connector,
      config: agentConfig
    })
    await t.throws(agent.startup(), Error)
  }
)

test.serial('Env.4: Agent starts if config file path is invalid', async t => {
  const connector = new ConnectorService(() => {
    connector.updateActiveState(true)
    connector.updateRegistrationState(true, 'dummy')
  })
  let agentConfig = Utils.createDefaultAgentConfig(1990)
  agentConfig['ENEBULAR_CONFIG_PATH'] = '/tmp/invalid-path/file'

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
})

test.serial('Env.5: Agent takes nodeRedCommand to launch node-red', async t => {
  let agentConfig = Utils.createDefaultAgentConfig(30000)

  const connector = new ConnectorService(() => {
    connector.updateActiveState(true)
  })

  agent = new EnebularAgent({
    portBasePath: path.resolve(__dirname, '../'),
    connector: connector,
    config: agentConfig
  })
  await t.notThrows(agent.startup(), Error)

  t.true(await nodeRedIsAlive(30000))
})

test.serial(
  'Env.6: Agent fails to start if command to launch node-red is invalid',
  async t => {
    const connector = new ConnectorService()
    let agentConfig = Utils.createDefaultAgentConfig(1990)
    agentConfig['NODE_RED_COMMAND'] = './node_modules/.bin/node-red-invalid'

    agent = new EnebularAgent({
      portBasePath: path.resolve(__dirname, '../'),
      connector: connector,
      config: agentConfig
    })
    await t.notThrows(
      agent
        .startup()
        .then(function(error) {
          console.log(error)
          t.fail()
        })
        .catch(function(error) {
          console.log(error)
          t.pass()
        }),
      Error
    )
  }
)

test.serial('Env.7: Agent starts normally with no config file', async t => {
  let configFileName = '/tmp/.enebular-config-' + Utils.randomString() + '.json'

  const connector = new ConnectorService()
  let agentConfig = Utils.createDefaultAgentConfig(1990)
  agentConfig['ENEBULAR_CONFIG_PATH'] = configFileName

  agent = new EnebularAgent({
    portBasePath: path.resolve(__dirname, '../'),
    connector: connector,
    config: agentConfig
  })
  return new Promise(async (resolve, reject) => {
    await t.notThrows(agent.startup(), Error)
    connector.updateActiveState(true)
    setTimeout(() => {
      fs.unlink(agentConfig['ENEBULAR_CONFIG_PATH'], err => {
        err = null
      })
      console.log('_agentState is:', agent._agentState)
      t.is(agent._agentState, 'unregistered')
      resolve()
    }, 500)
  })
})

test.serial('Env.8: Agent accepts all supported config items', async t => {
  const connector = new ConnectorService()
  let agentConfig = Utils.createDefaultAgentConfig(1990)
  agentConfig['ENEBULAR_CONFIG_PATH'] = Utils.createDummyEnebularConfig({})

  agent = new EnebularAgent({
    portBasePath: path.resolve(__dirname, '../'),
    connector: connector,
    config: agentConfig
  })
  return new Promise(async (resolve, reject) => {
    await t.notThrows(agent.startup(), Error)
    connector.updateActiveState(true)
    setTimeout(() => {
      fs.unlink(agentConfig['ENEBULAR_CONFIG_PATH'], err => {
        err = null
      })

      console.log('_agentState is:', agent._agentState)
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

test.serial('Env.9: Agent handles an invalid config file', async t => {
  const connector = new ConnectorService()
  let agentConfig = Utils.createDefaultAgentConfig(1990)
  agentConfig['ENEBULAR_CONFIG_PATH'] = Utils.createBrokenEnebularConfig()

  agent = new EnebularAgent({
    portBasePath: path.resolve(__dirname, '../'),
    connector: connector,
    config: agentConfig
  })
  return new Promise(async (resolve, reject) => {
    await t.notThrows(agent.startup(), Error)
    connector.updateActiveState(true)
    setTimeout(() => {
      fs.unlink(agentConfig['ENEBULAR_CONFIG_PATH'], err => {
        err = null
      })
      t.is(agent._agentState, 'unregistered')
      resolve()
    }, 500)
  })
})
