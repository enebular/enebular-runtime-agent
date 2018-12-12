/* @flow */
import test from 'ava'
import fs from 'fs'
import { Server } from 'net'
import objectPath from 'object-path'

import EnebularAgent from '../src/enebular-agent'
import Utils from './helpers/utils'
import DummyServer from './helpers/dummy-server'
import {
  createConnectedAgent,
  createAuthenticatedAgent,
  polling,
  agentCleanup
} from './helpers/agent-helper'

import { version as agentVer } from '../package.json'

const DummyServerPort = 3007
const NodeRedPort = 4007

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
  server.removeAllListeners('deviceStateGet')
  server.onDeviceStateGet = null
  server.removeAllListeners('deviceStateUpdate')
  server.onDeviceStateUpdate = null
})

test.afterEach.always('cleanup', async t => {
  await agentCleanup(agent, NodeRedPort)
})

test.serial(
  'DeviceState.1: Device should not refresh states if it is not authenticated',
  async t => {
    let deviceStateGetReceived = false
    server.onDeviceStateGet = (req, res) => {
      deviceStateGetReceived = true
    }

    const ret = await createConnectedAgent(
      t,
      Utils.addNodeRedPortToConfig({}, NodeRedPort)
    )
    agent = ret.agent
    const callback = () => {
      return deviceStateGetReceived
    }
    t.false(await polling(callback, 0, 100, 3000))
  }
)

test.serial(
  'DeviceState.2: Device should refresh states if it is authenticated',
  async t => {
    let desiredGetReceived = false
    let reportedGetReceived = false
    let statusGetReceived = false
    server.onDeviceStateGet = (req, res) => {
      req.body.states.map(state => {
        switch (state.type) {
          case 'desired':
            desiredGetReceived = true
            break
          case 'reported':
            reportedGetReceived = true
            break
          case 'status':
            statusGetReceived = true
            break
        }

        return null
      })

      res.send({ states: null })
    }

    const ret = await createAuthenticatedAgent(
      t,
      server,
      Utils.addNodeRedPortToConfig({}, NodeRedPort),
      DummyServerPort
    )
    agent = ret.agent
    const callback = () => {
      return desiredGetReceived && reportedGetReceived && statusGetReceived
    }
    t.true(await polling(callback, 0, 100, 5000))
  }
)

test.serial(
  'DeviceState.3: Device handles server error respond (http error)',
  async t => {
    // don't set callback so the dummy server respond 400 error.
    let tmpLogPath = '/tmp/tmp-test-log-' + Utils.randomString()
    const ret = await createAuthenticatedAgent(
      t,
      server,
      Utils.addNodeRedPortToConfig(
        {
          ENEBULAR_ENABLE_FILE_LOG: true,
          ENEBULAR_LOG_FILE_PATH: tmpLogPath
        },
        NodeRedPort
      ),
      DummyServerPort
    )
    agent = ret.agent

    const log = fs.readFileSync(tmpLogPath, 'utf8')
    t.true(
      log.includes(
        'Device state get request failed: Failed response (400 Bad Request)'
      )
    )
    fs.unlinkSync(tmpLogPath)
    t.pass()
  }
)

test.serial(
  'DeviceState.4: Device handles server error respond (json format error)',
  async t => {
    let tmpLogPath = '/tmp/tmp-test-log-' + Utils.randomString()
    server.onDeviceStateGet = (req, res) => {
      res.send(Buffer.from('bad json string'))
    }
    const ret = await createAuthenticatedAgent(
      t,
      server,
      Utils.addNodeRedPortToConfig(
        {
          ENEBULAR_ENABLE_FILE_LOG: true,
          ENEBULAR_LOG_FILE_PATH: tmpLogPath
        },
        NodeRedPort
      ),
      DummyServerPort
    )
    agent = ret.agent

    const log = fs.readFileSync(tmpLogPath, 'utf8')
    t.true(
      log.includes(
        'Device state get request failed: Response did not contain JSON'
      )
    )
    fs.unlinkSync(tmpLogPath)
    t.pass()
  }
)

async function agentShouldUpdateStatus(t) {
  let deviceStateUpdateReceived = false
  let reportedStates = {}
  server.onDeviceStateUpdate = (req, res) => {
    const result = req.body.updates.map(update => {
      if (update.op === 'set') {
        objectPath.set(reportedStates, 'state.' + update.path, update.state)
      } else if (update.op === 'remove') {
        objectPath.del(reportedStates, 'state.' + update.path)
      }
      if (update.type === 'status') deviceStateUpdateReceived = true
      return {
        success: true,
        meta: {}
      }
    })
    res.send({ updates: result })
  }

  const ret = await createAuthenticatedAgent(
    t,
    server,
    Utils.addNodeRedPortToConfig({}, NodeRedPort),
    DummyServerPort
  )
  agent = ret.agent
  const callback = () => {
    return deviceStateUpdateReceived
  }
  t.true(await polling(callback, 0, 100, 3000))

  t.true(reportedStates.state.agent.type === 'enebular-agent')
  t.true(reportedStates.state.agent.v === agentVer)
}

test.serial(
  'DeviceState.5: Device should update status if status state on server is empty',
  async t => {
    server.onDeviceStateGet = (req, res) => {
      let _states = req.body.states.map(state => {
        return {
          type: state.type,
          state: {}
        }
      })
      res.send({ states: _states })
    }

    await agentShouldUpdateStatus(t)
  }
)

test.serial(
  'DeviceState.6: Device should update status if agent type in status is NOT identical',
  async t => {
    server.onDeviceStateGet = (req, res) => {
      let _states = req.body.states.map(state => {
        switch (state.type) {
          case 'desired':
          case 'reported':
            return {
              type: state.type,
              state: {}
            }
          case 'status':
            return Utils.getDummyStatusState(
              'enebular-agent-wrong-name',
              agentVer
            )
        }
      })
      res.send({ states: _states })
    }

    await agentShouldUpdateStatus(t)
  }
)

test.serial(
  'DeviceState.7: Device should update status if agent version in status is NOT identical',
  async t => {
    server.onDeviceStateGet = (req, res) => {
      let _states = req.body.states.map(state => {
        switch (state.type) {
          case 'desired':
          case 'reported':
            return {
              type: state.type,
              state: {}
            }
          case 'status':
            return Utils.getDummyStatusState('enebular-agent', agentVer + '.1')
        }
      })
      res.send({ states: _states })
    }

    await agentShouldUpdateStatus(t)
  }
)

test.serial(
  'DeviceState.8: Device should NOT update status if status is identical',
  async t => {
    let deviceStatusStateUpdateReceived = false
    server.onDeviceStateGet = (req, res) => {
      res.send({ states: Utils.getEmptyDeviceState() })
    }
    server.onDeviceStateUpdate = (req, res) => {
      const result = req.body.updates.map(update => {
        if (update.type === 'status') {
          deviceStatusStateUpdateReceived = true
        }
        return {
          success: true,
          meta: {}
        }
      })
      res.send({ updates: result })
    }

    const ret = await createAuthenticatedAgent(
      t,
      server,
      Utils.addNodeRedPortToConfig({}, NodeRedPort),
      DummyServerPort
    )
    agent = ret.agent
    const callback = () => {
      return deviceStatusStateUpdateReceived
    }
    t.false(await polling(callback, 0, 100, 3000))
  }
)

test.serial('DeviceState.9: Device retries if status updates fail', async t => {
  let deviceStateUpdateReceived = 0
  server.onDeviceStateGet = (req, res) => {
    let _states = req.body.states.map(state => {
      return {
        type: state.type,
        state: {}
      }
    })
    res.send({ states: _states })
  }

  server.onDeviceStateUpdate = (req, res) => {
    deviceStateUpdateReceived++
    res.status(400).send({})
  }

  const ret = await createAuthenticatedAgent(
    t,
    server,
    Utils.addNodeRedPortToConfig({}, NodeRedPort),
    DummyServerPort
  )
  agent = ret.agent
  const callback = () => {
    return deviceStateUpdateReceived === 2
  }
  t.true(await polling(callback, 0, 100, 1000 * 65))
})

test.serial(
  'DeviceState.10: Device should update monitoring state if not existed in reported state',
  async t => {
    let monitoringStateUpdateReceived = false
    server.onDeviceStateGet = (req, res) => {
      res.send({ states: Utils.getEmptyDeviceState() })
    }
    server.onDeviceStateUpdate = (req, res) => {
      const result = req.body.updates.map(update => {
        if (update.type === 'reported' && update.path === 'monitoring') {
          monitoringStateUpdateReceived = true
        }
        return {
          success: true,
          meta: {}
        }
      })
      res.send({ updates: result })
    }

    const ret = await createAuthenticatedAgent(
      t,
      server,
      Utils.addNodeRedPortToConfig({}, NodeRedPort),
      DummyServerPort
    )
    agent = ret.agent
    const callback = () => {
      return monitoringStateUpdateReceived
    }
    t.true(await polling(callback, 0, 100, 3000))
  }
)
