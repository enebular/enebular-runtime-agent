/* @flow */
import test from 'ava'
import fs from 'fs-extra'
import path from 'path'
import jwt from 'jsonwebtoken'
import { Server } from 'net'

import EnebularAgent from '../src/enebular-agent'
import ConnectorService from '../src/connector-service'
import Utils from './helpers/utils'
import DummyServer from './helpers/dummy-server'
import DummyServerConfig from './helpers/dummy-server-config'
import {
  polling,
  createConnectedAgent,
  createAuthenticatedAgent,
  agentCleanup
} from './helpers/agent-helper'

const DummyServerPort = 3005
const NodeRedPort = 4005
const MonitoringActiveDelay = 10 * 1000

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

test.serial(
  'Core.5: Agent enables sending log when status changed to authenticated',
  async t => {
    let recordLogsReceived = false
    let tmpLogCacheDir = '/tmp/enebular-log-cache-' + Utils.randomString()
    server.on('recordLogs', () => {
      console.log('recordLogs received.')
      recordLogsReceived = true
    })

    const ret = await createAuthenticatedAgent(
      t,
      server,
      Utils.addNodeRedPortToConfig({
        ENEBULAR_ENEBULAR_LOG_CACHE_PATH: tmpLogCacheDir
      }, NodeRedPort),
      DummyServerPort
    )
    agent = ret.agent

    t.true(
      await polling(
        () => {
          return agent._monitoringActive
        },
        MonitoringActiveDelay,
        500,
        3000
      )
    )
    // shut down agent should trigger records-log request
    await agent.shutdown()
    agent = null

    t.true(
      await polling(
        () => {
          return recordLogsReceived
        },
        0,
        500,
        5000
      )
    )
    fs.removeSync(tmpLogCacheDir)
  }
)

test.serial(
  'Core.6: Agent sends log periodically - fast',
  async t => {
    let recordLogReceived = 0
    let tmpLogCacheDir = '/tmp/enebular-log-cache-' + Utils.randomString()
    server.on('recordLogs', req => {
      recordLogReceived++
    })

    const ret = await createAuthenticatedAgent(
      t,
      server,
      Utils.addNodeRedPortToConfig(
        {
          ENEBULAR_ENEBULAR_LOG_CACHE_PATH: tmpLogCacheDir,
          ENEBULAR_MONITOR_INTERVAL_FAST: 1,
          ENEBULAR_MONITOR_INTERVAL_FAST_PERIOD: 5
        },
        NodeRedPort
      ),
      DummyServerPort
    )
    agent = ret.agent

    t.true(
      await polling(
        () => {
          return agent._monitoringActive
        },
        0,
        100,
        MonitoringActiveDelay + 3000
      )
    )

    const tolerance = 500
    for (let i = 0; i < 4; i++) {
      recordLogReceived = 0
      t.true(
        await polling(
          () => {
            return recordLogReceived === 1
          },
          0,
          100,
          1000 + tolerance
        )
      )
    }
    fs.removeSync(tmpLogCacheDir)
  }
)

test.serial(
  'Core.7: Agent sends log periodically - normal',
  async t => {
    let recordLogReceived = 0
    let lastNotifyTime
    let tmpLogCacheDir = '/tmp/enebular-log-cache-' + Utils.randomString()
    server.on('recordLogs', req => {
      recordLogReceived++
      if (lastNotifyTime)
        console.log('interval to last notify: ' + (Date.now() - lastNotifyTime))
      lastNotifyTime = Date.now()
    })

    const ret = await createAuthenticatedAgent(
      t,
      server,
      Utils.addNodeRedPortToConfig(
        {
          ENEBULAR_ENEBULAR_LOG_CACHE_PATH: tmpLogCacheDir,
          ENEBULAR_MONITOR_INTERVAL_FAST: 2,
          ENEBULAR_MONITOR_INTERVAL_FAST_PERIOD: 3,
          ENEBULAR_MONITOR_INTERVAL_NORMAL: 6
        },
        NodeRedPort
      ),
      DummyServerPort
    )
    agent = ret.agent

    t.true(
      await polling(
        () => {
          return agent._monitoringActive
        },
        0,
        100,
        MonitoringActiveDelay + 3000
      )
    )

    recordLogReceived = 0
    let tolerance = 1000
    t.true(
      await polling(
        () => {
          return recordLogReceived === 1
        },
        0,
        100,
        2000 + tolerance
      )
    )

    tolerance = 2000
    for (let i = 0; i < 2; i++) {
      recordLogReceived = 0
      t.true(
        await polling(
          () => {
            return recordLogReceived === 1
          },
          0,
          100,
          6000 + tolerance
        )
      )
    }
    fs.removeSync(tmpLogCacheDir)
  }
)

test.serial(
  'Core.8: Agent stops sending log when it is unauthenticated',
  async t => {
    let authRequestReceived = false
    let recordLogReceived = 0
    let tmpLogCacheDir = '/tmp/enebular-log-cache-' + Utils.randomString()
    server.on('recordLogs', req => {
      recordLogReceived++
    })

    const ret = await createAuthenticatedAgent(
      t,
      server,
      Utils.addNodeRedPortToConfig(
        {
          ENEBULAR_ENEBULAR_LOG_CACHE_PATH: tmpLogCacheDir,
          ENEBULAR_MONITOR_INTERVAL_FAST: 1
        },
        NodeRedPort
      ),
      DummyServerPort
    )
    agent = ret.agent

    t.true(
      await polling(
        () => {
          return agent._monitoringActive
        },
        MonitoringActiveDelay,
        500,
        3000
      )
    )

    // callback to process unauthentication.
    const authCallback = req => {
      authRequestReceived = true
      // unauthenticate the agent by clearing accessToken
      let token = jwt.sign({ nonce: req.nonce }, 'dummy')
      ret.connector.sendMessage('updateAuth', {
        idToken: token,
        accessToken: '-',
        state: req.state
      })
    }
    server.on('authRequest', authCallback)

    await polling(
      () => {
        return recordLogReceived >= 4
      },
      0,
      500,
      10000
    )

    // trigger auth request
    ret.connector.sendMessage('updateAuth', {
      idToken: '-',
      accessToken: '-',
      state: '-'
    })

    recordLogReceived = 0
    t.false(
      await polling(
        () => {
          return recordLogReceived
        },
        1000,
        500,
        3000
      )
    )

    server.removeListener('authRequest', authCallback)
    t.true(authRequestReceived)
    t.is(agent._agentState, 'unauthenticated')
    fs.removeSync(tmpLogCacheDir)
  }
)
