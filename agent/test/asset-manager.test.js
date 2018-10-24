/* @flow */
import test from 'ava'
import fs from 'fs'
import { Server } from 'net'

import EnebularAgent from '../src/enebular-agent'
import Utils from './helpers/utils'
import DummyServer from './helpers/dummy-server'
import { createConnectedAgent,
         createAuthenticatedAgent, 
         createUnauthenticatedAgent, 
         polling } from './helpers/agent-helper'

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

test.serial('AssetManager.1: Device should NOT update status if status matches', async t => {
  let deviceStateUpdateReceived = false
  server.onDeviceStateGet = (req, res) => {
    let _states = req.body.states.map(state => {
      switch (state.type) {
      case 'desired':
        return {
          type: state.type,
          state: { assets: { assets: {
            '20f95284-a229-450f-b68b-1a8a277e0a65': {
              ts: Date.now(),
              config: {
                name: 'test1',
                type: 'file',
                destPath: 'dst1',
                fileTypeConfig: {
                  filename: 'AmazonRootCA1.pem',
                  integrity: 'E6oD52OarXOv4TWL3UV53HlnzHViVmlKrRNw/pPb68k=',
                  internalSrcConfig: {
                    key: 'flow1.json',
                    stored: true,
                  }
                },
              }
            },
          } } }
        }
      case 'reported':
        return {
          type: state.type,
          state: {}
        }
      case 'status':
        return Utils.getDummyStatusState("enebular-agent", agentVer)
      }
    })
    res.send({ states: _states })
  }
  server.onDeviceStateUpdate = (req, res) => {
    deviceStateUpdateReceived = true
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
  t.false(await polling(callback, 0, 100, 3000))
})



