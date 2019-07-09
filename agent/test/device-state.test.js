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

    const ctrlMsgCallback = (connector, msg) => {
      t.true(msg.type == 'req')
      t.true(msg.topic == 'deviceState/device/get')
      msg.body.states.map(state => {
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
      })
    }

    const ret = await createAuthenticatedAgent(
      t,
      server,
      Utils.addNodeRedPortToConfig({}, NodeRedPort),
      DummyServerPort,
      ctrlMsgCallback 
    )
    agent = ret.agent

    const callback = () => {
      return desiredGetReceived && reportedGetReceived && statusGetReceived
    }
    t.true(await polling(callback, 0, 100, 5000))
  }
)

test.serial(
  'DeviceState.3: Device retries ctrl message sending if timeout',
  async t => {
    let tmpLogPath = '/tmp/tmp-test-log-' + Utils.randomString()
    const ret = await createAuthenticatedAgent(
      t,
      server,
      Utils.addNodeRedPortToConfig(
        {
          ENEBULAR_ENABLE_FILE_LOG: true,
          ENEBULAR_LOG_FILE_PATH: tmpLogPath,
          ENEBULAR_CONNECTOR_MESSENGER_REQ_RETYR_TIMEOUT: 500,
          ENEBULAR_DEVICE_STATE_REFRESH_INTERVAL: 10
        },
        NodeRedPort
      ),
      DummyServerPort
    )
    agent = ret.agent

    const callback = () => {
      const log = fs.readFileSync(tmpLogPath, 'utf8')
      return log.includes("Retrying request '1' (2/3) module=connector-messenger")
    }
    t.true(await polling(callback, 0, 1000, 15000))

    fs.unlinkSync(tmpLogPath)
    t.pass()
  }
)

test.serial(
  'DeviceState.4: Device handles ctrl message error respond',
  async t => {
    let tmpLogPath = '/tmp/tmp-test-log-' + Utils.randomString()
    let desiredGetReceived = false
    let reportedGetReceived = false
    let statusGetReceived = false

    const ctrlMsgCallback = (connector, msg) => {
      t.true(msg.type == 'req')
      t.true(msg.topic == 'deviceState/device/get')
      msg.body.states.map(state => {
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
      })
      connector.sendCtrlMessage({ type: 'res', id: msg.id })
      // duplicated message
      connector.sendCtrlMessage({ type: 'res', id: msg.id })
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
      DummyServerPort,
      ctrlMsgCallback 
    )
    agent = ret.agent

    const log = fs.readFileSync(tmpLogPath, 'utf8')
    t.true(
      log.includes(
        'Failed to get device state: Error response'
      )
    )
    fs.unlinkSync(tmpLogPath)
    t.pass()
  }
)

async function agentShouldUpdateStatus(t, getStateCallback) {
  let deviceStateUpdateReceived = false
  let reportedStates = {}
  const ctrlMsgCallback = (connector, msg) => {
    if (msg.topic == 'deviceState/device/get') {
      const _states = getStateCallback(msg)

      connector.sendCtrlMessage({ 
        type: 'res',
        id: msg.id, 
        res: 'ok', 
        body: {
          states: _states
        } 
      })
    }
    else if (msg.topic == 'deviceState/device/update') {
      const result = msg.body.updates.map(update => {
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

      connector.sendCtrlMessage({ 
        type: 'res',
        id: msg.id, 
        res: 'ok', 
        body: {
          updates: result
        } 
      })
    }
  }

 const ret = await createAuthenticatedAgent(
    t,
    server,
    Utils.addNodeRedPortToConfig({}, NodeRedPort),
    DummyServerPort,
    ctrlMsgCallback 
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
    const getStateCallback = (msg) => {
      return msg.body.states.map(state => {
        return {
          type: state.type,
          state: {}
        }
      })
    }

    await agentShouldUpdateStatus(t, getStateCallback)
  }
)

test.serial(
  'DeviceState.6: Device should update status if agent type in status is NOT identical',
  async t => {
    const getStateCallback = (msg) => {
      return msg.body.states.map(state => {
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
    }

    await agentShouldUpdateStatus(t, getStateCallback)
  }
)

test.serial(
  'DeviceState.7: Device should update status if agent version in status is NOT identical',
  async t => {
    const getStateCallback = (msg) => {
      return msg.body.states.map(state => {
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
    }

    await agentShouldUpdateStatus(t, getStateCallback)
  }
)

test.serial('DeviceState.8: Device retries if status updates fail', async t => {
  let deviceStateUpdateReceived = 0
  const ctrlMsgCallback = (connector, msg) => {
    if (msg.topic == 'deviceState/device/get') {
      connector.sendCtrlMessage({ 
        type: 'res',
        id: msg.id, 
        res: 'ok', 
        body: {
          states: Utils.getEmptyDeviceState()
        } 
      })
    }
    else if (msg.topic == 'deviceState/device/update') {
      const result = msg.body.updates.map(update => {
        deviceStateUpdateReceived++
      })
    }
  }

  const ret = await createAuthenticatedAgent(
    t,
    server,
    Utils.addNodeRedPortToConfig({
      ENEBULAR_FLOW_STATE_PATH: '/tmp/enebular-flow-' + Utils.randomString(),
      ENEBULAR_CONNECTOR_MESSENGER_REQ_RETYR_TIMEOUT: 500,
      ENEBULAR_DEVICE_STATE_REFRESH_INTERVAL: 10
    }, NodeRedPort),
    DummyServerPort,
    ctrlMsgCallback
  )
  agent = ret.agent
  const callback = () => {
    return deviceStateUpdateReceived === 3
  }
  t.true(await polling(callback, 0, 100, 1000 * 65))
})

test.serial(
  'DeviceState.9: Device should update monitoring state if not existed in reported state',
  async t => {
    let monitoringStateUpdateReceived = false
    const ctrlMsgCallback = (connector, msg) => {
      if (msg.topic == 'deviceState/device/get') {
        connector.sendCtrlMessage({ 
          type: 'res',
          id: msg.id, 
          res: 'ok', 
          body: {
            states: Utils.getEmptyDeviceState()
          } 
        })
      }
      else if (msg.topic == 'deviceState/device/update') {
        const result = msg.body.updates.map(update => {
          if (update.type === 'reported' && update.path === 'monitoring') {
            monitoringStateUpdateReceived = true
          }
          return {
            success: true,
            meta: {}
          }
        })
        connector.sendCtrlMessage({ 
          type: 'res',
          id: msg.id, 
          res: 'ok', 
          body: {
            updates: result
          } 
        })
      }
    }

    const ret = await createAuthenticatedAgent(
      t,
      server,
      Utils.addNodeRedPortToConfig({
        ENEBULAR_FLOW_STATE_PATH: '/tmp/enebular-flow-' + Utils.randomString(),
      }, NodeRedPort),
      DummyServerPort,
      ctrlMsgCallback
    )
    agent = ret.agent
    const callback = () => {
      return monitoringStateUpdateReceived
    }
    t.true(await polling(callback, 0, 100, 3000))
  }
)
