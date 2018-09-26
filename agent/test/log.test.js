/* @flow */
import test from 'ava'
import fs from 'fs-extra'
import path from 'path'
import { Server } from 'net'

import EnebularAgent from '../src/enebular-agent'
import Utils from './helpers/utils'
import DummyServer from './helpers/dummy-server'
import { createAuthenticatedAgent } from './helpers/agent-helper'

const DummyServerPort = 3006
const NodeRedPort = 4006

let agent: EnebularAgent
let server: DummyServer
let http: Server

test.before(async t => {
  process.env.ENEBULAR_TEST = true
  // process.env.DEBUG = 'info'
  server = new DummyServer()
  http = await server.start(DummyServerPort)
})

test.after(t => {
  http.close()
})

test.beforeEach('cleanup log cache', t => {})

test.afterEach.always('cleanup listener', t => {
  server.removeAllListeners('recordLogs')
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

  server.setLogReturnBadRequest(false)
})

test.serial('Log.1: Log cache size is within max cache size', async t => {
  let totalSize = 0
  let maxSize = 1 * 1024 * 1024
  let tmpLogCacheDir = '/tmp/enebular-log-cache-' + Utils.randomString()
  server.setLogReturnBadRequest(true)
  const ret = await createAuthenticatedAgent(
    t,
    server,
    Utils.addNodeRedPortToConfig(
      {
        // set interval size larger than cache size so that cache size can be used.
        ENEBULAR_ENEBULAR_LOG_MAX_SIZE_PER_INTERVAL: 100 * 1024 * 1024,
        ENEBULAR_ENEBULAR_LOG_MAX_CACHE_SIZE: maxSize,
        ENEBULAR_ENEBULAR_LOG_CACHE_PATH: tmpLogCacheDir
      },
      NodeRedPort
    ),
    DummyServerPort
  )
  agent = ret.agent

  t.is(agent._logManager._enebularTransport._maxCacheSize, maxSize)
  t.is(
    agent._logManager._enebularTransport._maxSizePerInterval,
    100 * 1024 * 1024
  )

  const data = fs.readFileSync(path.join(__dirname, 'data', 'text.1k'), 'utf8')
  for (let i = 0; i < 2048; i++) {
    agent.log.info(data)
  }

  const getSize = require('get-folder-size')
  getSize('/tmp/enebular-log-cache', (err, size) => {
    if (err) {
      throw err
    }
    console.log(size + ' bytes')
    console.log((size / 1024 / 1024).toFixed(2) + ' MB')
    totalSize = size
  })
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      fs.removeSync(tmpLogCacheDir)
      resolve()
      t.true(totalSize < maxSize)
    }, 6000)
  })
})

test.serial('Log.2: Log is sent to server periodically', async t => {
  let tmpLogCacheDir = '/tmp/enebular-log-cache-' + Utils.randomString()
  let recordLogsReceived = 0
  const logCallback = req => {
    recordLogsReceived++
  }
  server.on('recordLogs', logCallback)

  let interval = 3
  const ret = await createAuthenticatedAgent(
    t,
    server,
    Utils.addNodeRedPortToConfig(
      {
        ENEBULAR_MONITOR_INTERVAL_FAST: interval,
        ENEBULAR_ENEBULAR_LOG_CACHE_PATH: tmpLogCacheDir
      },
      NodeRedPort
    ),
    DummyServerPort
  )
  agent = ret.agent

  t.is(agent._logManager._enebularTransport._sendInterval, interval)

  const data = fs.readFileSync(path.join(__dirname, 'data', 'text.1k'), 'utf8')
  const intervalObj = setInterval(() => {
    agent.log.info(data)
  }, 500)

  return new Promise((resolve, reject) => {
    setTimeout(() => {
      fs.removeSync(tmpLogCacheDir)
      server.removeListener('recordLogs', logCallback)
      clearInterval(intervalObj)
      t.is(recordLogsReceived, 3)
      resolve()
    }, 11000)
  })
})

test.serial('Log.3: Log level is handled correctly', async t => {
  let tmpLogCacheDir = '/tmp/enebular-log-cache-' + Utils.randomString()
  const logCallback = file => {
    const log = file.buffer.toString()
    // console.log("log:", log)
    t.false(log.indexOf('"level":"info"') === -1)
    t.true(log.indexOf('"level":"debug"') === -1)
  }
  server.on('recordLogs', logCallback)

  let interval = 2
  const ret = await createAuthenticatedAgent(
    t,
    server,
    Utils.addNodeRedPortToConfig(
      {
        ENEBULAR_MONITOR_INTERVAL_FAST: interval,
        ENEBULAR_ENEBULAR_LOG_CACHE_PATH: tmpLogCacheDir,
        ENEBULAR_LOG_LEVEL: 'info'
      },
      NodeRedPort
    ),
    DummyServerPort
  )
  agent = ret.agent

  t.is(agent._logManager._enebularTransport._sendInterval, interval)

  const data = fs.readFileSync(path.join(__dirname, 'data', 'text.1k'), 'utf8')
  const intervalObj = setInterval(() => {
    agent.log.debug(data)
  }, 500)

  return new Promise((resolve, reject) => {
    setTimeout(() => {
      fs.removeSync(tmpLogCacheDir)
      server.removeListener('recordLogs', logCallback)
      clearInterval(intervalObj)
      resolve()
    }, 5000)
  })
})

test.serial(
  'Log.4: Size of each log is within max size per interval',
  async t => {
    const maxSizePerInterval = 1107
    let tmpLogCacheDir = '/tmp/enebular-log-cache-' + Utils.randomString()
    const logCallback = file => {
      console.log('size.........:', file.size)
      t.true(file.size < maxSizePerInterval)
    }
    server.on('recordLogs', logCallback)

    const ret = await createAuthenticatedAgent(
      t,
      server,
      Utils.addNodeRedPortToConfig(
        {
          // set interval size larger than cache size so that cache size can be used.
          ENEBULAR_ENEBULAR_LOG_MAX_SIZE_PER_INTERVAL: maxSizePerInterval,
          ENEBULAR_ENEBULAR_LOG_CACHE_PATH: tmpLogCacheDir,
          ENEBULAR_ENABLE_CONSOLE_LOG: false,
          ENEBULAR_MONITOR_INTERVAL_FAST: 1
        },
        NodeRedPort
      ),
      DummyServerPort
    )
    agent = ret.agent

    t.is(
      agent._logManager._enebularTransport._maxSizePerInterval,
      maxSizePerInterval
    )
    const intervalObj = setInterval(() => {
      agent.log.info('1')
    }, 1)

    return new Promise((resolve, reject) => {
      setTimeout(() => {
        fs.removeSync(tmpLogCacheDir)
        server.removeListener('recordLogs', logCallback)
        clearInterval(intervalObj)
        resolve()
      }, 7000)
    })
  }
)
