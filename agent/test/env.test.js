/* @flow */
import test from 'ava'
import fs from 'fs'

import EnebularAgent from '../src/enebular-agent'
import ConnectorService from '../src/connector-service'
import Utils from './helpers/utils'
import { nodeRedIsAlive } from './helpers/agent-helper'
import DummyServerConfig from './helpers/dummy-server-config'

const DummyServerPort = 3001
// const NodeRedPort = 4001

let agent: EnebularAgent

test.before(t => {
  process.env.DEBUG = 'info'
})

test.afterEach.always('cleanup', async t => {
  if (agent) {
    console.log('cleanup: agent')
    await agent.shutdown().catch(error => {
      // ignore the error, we don't care this
      // set to null to avoid 'unused' lint error
      error = null
    })
    agent = null
  }
})

test.serial('Env.1: Agent starts if node-red path is valid', async t => {
  let agentConfig = Utils.createDefaultAgentConfig(30001)

  const connector = new ConnectorService(() => {
    connector.updateActiveState(true)
  })
  agent = new EnebularAgent(connector)
  t.notThrows(async () => {
    await agent.startup(agentConfig)
  }, Error)
  t.true(await nodeRedIsAlive(30001, 3000))
})

test.serial('Env.2: Agent fails to start if node-red path is invalid', async t => {
  const connector = new ConnectorService()
  let agentConfig = Utils.createDefaultAgentConfig(1990)

  agentConfig['nodeRedDir'] = '../node-red-invalid'
  agentConfig['configFile'] = '.enebular-config.json'

  agent = new EnebularAgent(connector)
  await t.throws(agent.startup(agentConfig), Error)
})

test.serial(
  'Env.3: Agent fails to start if node-red data path is invalid',
  async t => {
    const connector = new ConnectorService()
    let agentConfig = Utils.createDefaultAgentConfig(1990)
    agentConfig['nodeRedDataDir'] = '../node-red-data-invalid'
    agentConfig['configFile'] = '.enebular-config.json'

    agent = new EnebularAgent(connector)
    await t.throws(agent.startup(agentConfig), Error)
  }
)

test.serial('Env.4: Agent starts if config file path is invalid', async t => {
  const connector = new ConnectorService(() => {
    connector.updateActiveState(true)
    connector.updateRegistrationState(true, 'dummy')
  })
  let agentConfig = Utils.createDefaultAgentConfig(1990)
  agentConfig['configFile'] = '/tmp/invalid-path/file'

  agent = new EnebularAgent(connector)
  return new Promise(async (resolve, reject) => {
    agent.on('connectorConnect', async () => {
      t.pass()
      resolve()
    })

    await agent.startup(agentConfig)
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

  agent = new EnebularAgent(connector)
  await t.notThrows(agent.startup(agentConfig), Error)

  t.true(await nodeRedIsAlive(30000, 3000))
})

test.serial(
  'Env.6: Agent fails to start if command to launch node-red is invalid',
  async t => {
    const connector = new ConnectorService()
    let agentConfig = Utils.createDefaultAgentConfig(1990)
    agentConfig['nodeRedCommand'] = './node_modules/.bin/node-red-invalid'

    agent = new EnebularAgent(connector)
    await t.notThrows(agent
      .startup(agentConfig)
      .then(function(error) {
        console.log(error)
        t.fail()
      })
      .catch(function(error) {
        console.log(error)
        t.pass()
      }), Error)
  }
)

test.serial('Env.7: Agent starts normally with no config file', async t => {
  let configFileName = '/tmp/.enebular-config-' + Utils.randomString() + '.json'

  const connector = new ConnectorService()
  let agentConfig = Utils.createDefaultAgentConfig(1990)
  agentConfig['configFile'] = configFileName

  agent = new EnebularAgent(connector)

  return new Promise(async (resolve, reject) => {
    await t.notThrows(agent.startup(agentConfig), Error)
    connector.updateActiveState(true)
    setTimeout(() => {
      fs.unlink(agentConfig['configFile'], err => {
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
  agentConfig['configFile'] = Utils.createDummyEnebularConfig({})

  agent = new EnebularAgent(connector)

  return new Promise(async (resolve, reject) => {
    await t.notThrows(agent.startup(agentConfig), Error)
    connector.updateActiveState(true)
    setTimeout(() => {
      fs.unlink(agentConfig['configFile'], err => {
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
  agentConfig['configFile'] = Utils.createBrokenEnebularConfig()

  agent = new EnebularAgent(connector)

  return new Promise(async (resolve, reject) => {
    await t.notThrows(agent.startup(agentConfig), Error)
    connector.updateActiveState(true)
    setTimeout(() => {
      fs.unlink(agentConfig['configFile'], err => {
        err = null
      })
      t.is(agent._agentState, 'unregistered')
      resolve()
    }, 500)
  })
})
