/* @flow */
import test from 'ava'
import fs from 'fs-extra'
import jwt from 'jsonwebtoken'
import { Server } from 'net'
import EnebularAgent from '../src/enebular-agent'
import Utils from './helpers/utils'
import DummyServer from './helpers/dummy-server'
import {
  polling,
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
  'Monitor.1: Agent enables sending log when status changed to authenticated',
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
      Utils.addNodeRedPortToConfig(
        { ENEBULAR_ENEBULAR_LOG_CACHE_PATH: tmpLogCacheDir },
        NodeRedPort
      ),
      DummyServerPort
    )
    agent = ret.agent

    t.true(
      await polling(
        () => {
          return agent._monitorManager._active
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

test.serial('Monitor.2: Agent sends log periodically - fast', async t => {
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
        return agent._monitorManager._active
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
})

test.serial('Monitor.3: Agent sends log periodically - normal', async t => {
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
        return agent._monitorManager._active
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
})

test.serial(
  'Monitor.4: Agent stops sending log when it is unauthenticated',
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
          return agent._monitorManager._active
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
