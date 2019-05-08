/* @flow */
import test from 'ava'
import path from 'path'
import fs from 'fs-extra'
import { Server } from 'net'

import EnebularAgent from '../src/enebular-agent'
import Utils from './helpers/utils'
import DummyServer from './helpers/dummy-server'
import {
  createAgentWithAssetsDeployed,
  waitAssetProcessing,
  agentCleanup
} from './helpers/agent-helper'

import objectPath from 'object-path'

const DummyServerPort = 3009
const NodeRedPort = 4009

let agent: EnebularAgent
let server: DummyServer
let http: Server
let randomDataPath = '/tmp/tmp-asset-file-' + Utils.randomString()

test.before(async t => {
  process.env.ENEBULAR_TEST = true
  process.env.DEBUG = 'debug'
  server = new DummyServer()
  server.setTmpAssetFilePath(randomDataPath)
  http = await server.start(DummyServerPort)

  if (!fs.existsSync(randomDataPath)) fs.mkdirSync(randomDataPath)
})

test.after(t => {
  http.close()
  fs.removeSync(randomDataPath)
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
  'AssetManagerState.1: Agent handles multiple assets changes in desired status',
  async t => {
    let ret = await createAgentWithAssetsDeployed(
      t,
      server,
      NodeRedPort,
      DummyServerPort,
      3,
      false
    )
    agent = ret.agent
    let newAssetId = Utils.randomString()
    let assetName = 'asset_1.json'
    const integrity = await Utils.getFileIntegrity(
      path.join(__dirname, 'data', assetName)
    )

    ret.updateRequests.length = 0
    // remove
    let desiredState = Utils.delDesiredAsset(
      ret.deviceStates[0],
      ret.assets[0].id
    )
    // modify
    let updateId = Utils.randomString()
    desiredState = Utils.modifyDesiredAsset(
      ret.deviceStates[0],
      ret.assets[1].id,
      'updateId',
      updateId
    )
    // add
    desiredState = Utils.addFileAssetToDesiredState(
      ret.deviceStates[0],
      newAssetId,
      assetName,
      integrity
    )

    agent.removeAllListeners('connectorCtrlMessageSend')
    agent.on('connectorCtrlMessageSend', msg => {
      if (msg.topic == 'deviceState/device/get') {
        ret.deviceStates[0] = desiredState
        ret.connector.sendCtrlMessage({
          type: 'res',
          id: msg.id,
          res: 'ok',
          body: {
            states: ret.deviceStates
          }
        })
      }
    })

    // send message without meta data will trigger a desired status refresh.
    ret.connector.sendMessage('deviceStateChange', {
      type: 'desired',
      op: 'remove',
      path: 'assets.assets.wrong',
    })

    await waitAssetProcessing(agent, 2000, 10000)

    // console.log(ret.updateRequests)
    const state = JSON.parse(fs.readFileSync(ret.assetStatePath, 'utf8'))

    t.is(state[0].id, ret.assets[1].id)
    t.is(state[0].state, 'deployed')
    t.is(state[0].updateId, updateId)

    t.is(state[1].id, ret.assets[2].id)
    t.is(state[1].state, 'deployed')

    t.is(state[2].id, newAssetId)
    t.is(state[2].state, 'deployed')

    fs.unlinkSync(ret.assetStatePath)
    fs.removeSync(ret.assetDataPath)
  }
)

test.serial(
  'AssetManagerState.2: Agent should NOT update reported state if state is identical',
  async t => {
    let ret = await createAgentWithAssetsDeployed(
      t,
      server,
      NodeRedPort,
      DummyServerPort,
      2,
      false
    )
    agent = ret.agent

    ret.updateRequests.length = 0

    agent.removeAllListeners('connectorCtrlMessageSend')
    agent.on('connectorCtrlMessageSend', msg => {
      if (msg.topic == 'deviceState/device/get') {
        ret.deviceStates[1] = ret.reportedStates
        ret.connector.sendCtrlMessage({
          type: 'res',
          id: msg.id,
          res: 'ok',
          body: {
            states: ret.deviceStates
          }
        })
      }
    })

    // send message without meta data will trigger a state refresh.
    ret.connector.sendMessage('deviceStateChange', {
      type: 'desired',
      op: 'remove',
      path: 'assets.assets.wrong',
    })

    await waitAssetProcessing(agent, 1000, 10000)

    t.is(ret.updateRequests.length, 0)

    fs.unlinkSync(ret.assetStatePath)
    fs.removeSync(ret.assetDataPath)
  }
)

test.serial(
  'AssetManagerState.3: Agent updates reported state if state is different #1',
  async t => {
    let ret = await createAgentWithAssetsDeployed(
      t,
      server,
      NodeRedPort,
      DummyServerPort,
      2,
      false
    )
    agent = ret.agent
    // empty reported state
    let reported = {
      type: 'reported',
      state: {
        assets: {
          assets: {}
        }
      }
    }

    ret.updateRequests.length = 0

    agent.removeAllListeners('connectorCtrlMessageSend')
    agent.on('connectorCtrlMessageSend', msg => {
      if (msg.topic == 'deviceState/device/get') {
        ret.deviceStates[1] = reported
        ret.connector.sendCtrlMessage({
          type: 'res',
          id: msg.id,
          res: 'ok',
          body: {
            states: ret.deviceStates
          }
        })
      }
      else if (msg.topic == 'deviceState/device/update') {
        const result = msg.body.updates.map(update => {
          ret.updateRequests.push(update)
          if (update.op === 'set') {
            objectPath.set(ret.reportedStates, 'state.' + update.path, update.state)
          } else if (update.op === 'remove') {
            objectPath.del(ret.reportedStates, 'state.' + update.path)
          }
          return {
            success: true,
            meta: {}
          }
        })
        ret.connector.sendCtrlMessage({
          type: 'res',
          id: msg.id,
          res: 'ok',
          body: {
            updates: result
          }
        })
      }
    })

    // send message without meta data will trigger a state refresh.
    ret.connector.sendMessage('deviceStateChange', {
      type: 'desired',
      op: 'remove',
      path: 'assets.assets.wrong',
    })

    await waitAssetProcessing(agent, 2000, 10000)

    console.log(JSON.stringify(ret.updateRequests, null, 2))
    t.is(ret.updateRequests[0].path, 'monitoring')

    t.is(ret.updateRequests[1].path, 'assets.assets.' + ret.assets[0].id)
    t.is(ret.updateRequests[1].state.state, 'deployed')

    t.is(ret.updateRequests[2].path, 'assets.assets.' + ret.assets[1].id)
    t.is(ret.updateRequests[2].state.state, 'deployed')

    fs.unlinkSync(ret.assetStatePath)
    fs.removeSync(ret.assetDataPath)
  }
)

test.serial(
  'AssetManagerState.4: Agent updates reported state if state is different #2',
  async t => {
    let ret = await createAgentWithAssetsDeployed(
      t,
      server,
      NodeRedPort,
      DummyServerPort,
      2,
      false
    )
    agent = ret.agent

    ret.updateRequests.length = 0

    const updateIdPath = 'state.assets.assets.' + ret.assets[0].id + '.updateId'
    const newUpdateId = Utils.randomString()
    // remove
    objectPath.del(ret.reportedStates, 'state.monitoring')
    const oldUpdateId = objectPath.get(ret.reportedStates, updateIdPath)
    // modify
    objectPath.set(ret.reportedStates, updateIdPath, newUpdateId)
    // add
    const removeStatePath = 'assets.assets.' + Utils.randomString()
    objectPath.set(ret.reportedStates, 'state.' + removeStatePath, {
      updateId: Utils.randomString(),
      ts: Date.now(),
      config: {
        name: 'test',
        type: 'file',
        destPath: 'dst',
        fileTypeConfig: {
          filename: 'test',
          integrity: '--',
          internalSrcConfig: {
            key: 'test',
            stored: true
          }
        }
      }
    })

    agent.removeAllListeners('connectorCtrlMessageSend')
    agent.on('connectorCtrlMessageSend', msg => {
      if (msg.topic == 'deviceState/device/get') {
        ret.deviceStates[1] = ret.reportedStates
        ret.connector.sendCtrlMessage({
          type: 'res',
          id: msg.id,
          res: 'ok',
          body: {
            states: ret.deviceStates
          }
        })
      }
      else if (msg.topic == 'deviceState/device/update') {
        const result = msg.body.updates.map(update => {
          ret.updateRequests.push(update)
          if (update.op === 'set') {
            objectPath.set(ret.reportedStates, 'state.' + update.path, update.state)
          } else if (update.op === 'remove') {
            objectPath.del(ret.reportedStates, 'state.' + update.path)
          }
          return {
            success: true,
            meta: {}
          }
        })
        ret.connector.sendCtrlMessage({
          type: 'res',
          id: msg.id,
          res: 'ok',
          body: {
            updates: result
          }
        })
      }
    })

    // send message without meta data will trigger a state refresh.
    ret.connector.sendMessage('deviceStateChange', {
      type: 'desired',
      op: 'remove',
      state: {}
    })

    await waitAssetProcessing(agent, 1000, 10000)

    // console.log(JSON.stringify(ret.updateRequests, null, 2))
    t.is(ret.updateRequests[0].path, 'monitoring')
    t.is(ret.updateRequests[1].op, 'remove')
    t.is(ret.updateRequests[1].path, removeStatePath)
    t.is(ret.updateRequests[2].op, 'set')
    t.is(ret.updateRequests[2].state.updateId, oldUpdateId)

    fs.unlinkSync(ret.assetStatePath)
    fs.removeSync(ret.assetDataPath)
  }
)
