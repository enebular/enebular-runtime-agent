/* @flow */
import test from 'ava'
import path from 'path'
import fs from 'fs-extra'
import { Server } from 'net'

import EnebularAgent from '../src/enebular-agent'
import Utils from './helpers/utils'
import DummyServer from './helpers/dummy-server'
import {
  createAgentWithDummyServerAssetHandler,
  createAgentWithAssetsDeployed,
  waitAssetProcessing
} from './helpers/agent-helper'

import objectPath from 'object-path'

const DummyServerPort = 3007
const NodeRedPort = 4007

let agent: EnebularAgent
let server: DummyServer
let http: Server
let randomDataPath = path.join(__dirname, 'data', 'tmp')

test.before(async t => {
  process.env.ENEBULAR_TEST = true
  process.env.DEBUG = 'debug'
  server = new DummyServer()
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

function delAsset(desiredState, assetId) {
  objectPath.del(desiredState, 'state.assets.assets.' + assetId)
  return Utils.getDummyState('desired', desiredState.state)
}

function modifyAsset(desiredState, assetId, prop, value) {
  objectPath.set(
    desiredState,
    'state.assets.assets.' + assetId + '.' + prop,
    value
  )
  return Utils.getDummyState('desired', desiredState.state)
}

test.serial(
  'AssetManager.1: Agent deploys asset according to desired state',
  async t => {
    const ret = await createAgentWithAssetsDeployed(t, server, NodeRedPort, DummyServerPort, 1, true)
    agent = ret.agent
  }
)

test.serial(
  'AssetManager.2: Agent handles asset deploy failure(file integrity)',
  async t => {
    let tmpAssetDataPath = '/tmp/tmp-asset-data-' + Utils.randomString()
    let tmpAssetStatePath = '/tmp/tmp-asset-state-' + Utils.randomString()
    let newAssetId = Utils.randomString()
    let updateReq = []
    let deviceStates = Utils.getEmptyDeviceState()
    let assetName = 'asset_1.json'

    let ret = await createAgentWithDummyServerAssetHandler(
      t,
      server,
      NodeRedPort,
      DummyServerPort,
      deviceStates,
      tmpAssetDataPath,
      tmpAssetStatePath,
      updateReq,
      [],
      desiredState => {
        Utils.addFileAssetToDesiredState(desiredState, newAssetId, assetName, 'wrong integrity')
      }
    )
    agent = ret.agent

    await waitAssetProcessing(agent, 0, 10000)

    console.log(JSON.stringify(updateReq, null, 4))
    // should correctly send 5 reported state since it will retry twice.
    t.is(updateReq[1].state.state, 'deployPending')
    t.is(updateReq[2].state.state, 'deploying')
    t.is(updateReq[3].state.state, 'deployPending')
    t.is(updateReq[4].state.state, 'deploying')
    t.is(updateReq[5].state.state, 'deployFail')

    const state = JSON.parse(fs.readFileSync(tmpAssetStatePath, 'utf8'))
    // console.log(JSON.stringify(state, null, 4))
    t.is(state[0].id, newAssetId)
    t.is(state[0].state, 'deployFail')
    t.true(state[0].changeErrMsg.includes('File integrity mismatch'))
    fs.unlinkSync(tmpAssetStatePath)
    fs.removeSync(tmpAssetDataPath)
  }
)

test.serial(
  'AssetManager.3: Agent handles asset deploy failure(download file)',
  async t => {
    let tmpAssetDataPath = '/tmp/tmp-asset-data-' + Utils.randomString()
    let tmpAssetStatePath = '/tmp/tmp-asset-state-' + Utils.randomString()
    let newAssetId = Utils.randomString()
    let updateReq = []
    let deviceStates = Utils.getEmptyDeviceState()
    let assetName = 'asset_1.json'
    const integrity = await Utils.getFileIntegrity(
      path.join(__dirname, 'data', assetName)
    )

    let ret = await createAgentWithDummyServerAssetHandler(
      t,
      server,
      NodeRedPort,
      DummyServerPort,
      deviceStates,
      tmpAssetDataPath,
      tmpAssetStatePath,
      updateReq,
      [],
      desiredState => {
        Utils.addFileAssetToDesiredState(desiredState, newAssetId, 'wrong file name', integrity)
      }
    )
    agent = ret.agent

    await waitAssetProcessing(agent, 0, 10000)

    // should correctly send 5 reported state since it will retry twice.
    t.is(updateReq[1].state.state, 'deployPending')
    t.is(updateReq[2].state.state, 'deploying')
    t.is(updateReq[3].state.state, 'deployPending')
    t.is(updateReq[4].state.state, 'deploying')
    t.is(updateReq[5].state.state, 'deployFail')

    const state = JSON.parse(fs.readFileSync(tmpAssetStatePath, 'utf8'))
    console.log(JSON.stringify(state, null, 4))
    t.is(state[0].id, newAssetId)
    t.is(state[0].state, 'deployFail')
    t.true(state[0].changeErrMsg.includes('Failed to acquire asset'))
    fs.unlinkSync(tmpAssetStatePath)
    fs.removeSync(tmpAssetDataPath)
  }
)

test.serial(
  'AssetManager.4: Agent deploys multiple assets according to desired state',
  async t => {
    const ret = await createAgentWithAssetsDeployed(t, server, NodeRedPort, DummyServerPort, 20, true)
    agent = ret.agent
  }
)

test.serial(
  'AssetManager.5: Agent deploys new asset via deviceStateChange',
  async t => {
    let ret = await createAgentWithAssetsDeployed(t, server, NodeRedPort, DummyServerPort, 0, false)
    agent = ret.agent

    let newAssetId = Utils.randomString()
    let assetName = 'asset_1.json'
    const integrity = await Utils.getFileIntegrity(
      path.join(__dirname, 'data', assetName)
    )

    // Deplay new asset
    let desiredState = Utils.addFileAssetToDesiredState(
      ret.deviceStates[0],
      newAssetId,
      assetName,
      integrity
    )
    ret.connector.sendMessage('deviceStateChange', {
      type: 'desired',
      op: 'set',
      path: 'assets.assets.' + newAssetId,
      meta: desiredState.meta,
      state: desiredState.state.assets.assets[newAssetId]
    })

    await waitAssetProcessing(agent, 2000, 5000)
    const cacheStates = JSON.parse(fs.readFileSync(ret.assetStatePath, 'utf8'))

    t.is(cacheStates[0].id, newAssetId)
    t.is(cacheStates[0].state, 'deployed')
    t.true(fs.existsSync(ret.assetDataPath + '/dst/' + assetName))

    fs.unlinkSync(ret.assetStatePath)
    fs.removeSync(ret.assetDataPath)
  }
)

test.serial(
  'AssetManager.6: Agent re-deploys existing asset via deviceStateChange',
  async t => {
    let ret = await createAgentWithAssetsDeployed(t, server, NodeRedPort, DummyServerPort, 1, false)
    agent = ret.agent
    let newAssetId = ret.assets[0].id
    let newAssetName = ret.assets[0].name

    ret.updateRequests.length = 0
    // Deplay again
    let updateId = Utils.randomString()
    let desiredState = modifyAsset(
      ret.deviceStates[0],
      newAssetId,
      'updateId',
      updateId
    )
    ret.connector.sendMessage('deviceStateChange', {
      type: 'desired',
      op: 'set',
      path: 'assets.assets.' + newAssetId,
      meta: desiredState.meta,
      state: desiredState.state.assets.assets[newAssetId]
    })

    await waitAssetProcessing(agent, 2000, 5000)

    t.is(ret.updateRequests[0].state.state, 'deployPending')
    t.is(ret.updateRequests[1].state.state, 'removing')
    t.is(ret.updateRequests[2].state.state, 'deploying')
    t.is(ret.updateRequests[3].state.state, 'deployed')
    t.true(fs.existsSync(ret.assetDataPath + '/dst/' + newAssetName))
    const state = JSON.parse(fs.readFileSync(ret.assetStatePath, 'utf8'))
    t.is(state[0].id, newAssetId)
    t.is(state[0].state, 'deployed')
    t.is(state[0].updateId, updateId)
    t.true(fs.existsSync(ret.assetDataPath + '/dst/' + newAssetName))

    fs.unlinkSync(ret.assetStatePath)
    fs.removeSync(ret.assetDataPath)
  }
)

test.serial(
  'AssetManager.7: Agent removes existing asset via deviceStateChange',
  async t => {
    let ret = await createAgentWithAssetsDeployed(t, server, NodeRedPort, DummyServerPort, 1, false)
    agent = ret.agent
    let newAssetId = ret.assets[0].id
    let newAssetName = ret.assets[0].name

    ret.updateRequests.length = 0

    let desiredState = delAsset(ret.deviceStates[0], newAssetId)
    ret.connector.sendMessage('deviceStateChange', {
      type: 'desired',
      op: 'remove',
      path: 'assets.assets.' + newAssetId,
      meta: desiredState.meta,
      state: desiredState.state.assets.assets[newAssetId]
    })

    await waitAssetProcessing(agent, 2000, 5000)

    t.is(ret.updateRequests[0].state.state, 'removePending')
    t.is(ret.updateRequests[1].state.state, 'removing')
    t.is(ret.updateRequests[2].op, 'remove')
    t.false(fs.existsSync(ret.assetDataPath + '/dst/' + newAssetName))
    const state = JSON.parse(fs.readFileSync(ret.assetStatePath, 'utf8'))
    t.true(state.length == 0)

    fs.unlinkSync(ret.assetStatePath)
    fs.removeSync(ret.assetDataPath)
  }
)

test.serial('AssetManager.8: Agent handles removing asset failure', async t => {
  let ret = await createAgentWithAssetsDeployed(t, server, NodeRedPort, DummyServerPort, 1, false)
  agent = ret.agent
  let newAssetId = ret.assets[0].id
  let newAssetName = ret.assets[0].name
  let newAssetPath = ret.assetDataPath + '/dst/' + newAssetName

  ret.updateRequests.length = 0

  // change file to directory which fails the removing
  fs.removeSync(newAssetPath)
  fs.mkdirSync(newAssetPath)

  let desiredState = delAsset(ret.deviceStates[0], newAssetId)
  ret.connector.sendMessage('deviceStateChange', {
    type: 'desired',
    op: 'remove',
    path: 'assets.assets.' + newAssetId,
    meta: desiredState.meta,
    state: desiredState.state.assets.assets[newAssetId]
  })

  await waitAssetProcessing(agent, 2000, 5000)

  t.is(ret.updateRequests[0].state.state, 'removePending')
  t.is(ret.updateRequests[1].state.state, 'removing')
  t.is(ret.updateRequests[2].state.state, 'removeFail')
  t.true(fs.existsSync(newAssetPath))
  const state = JSON.parse(fs.readFileSync(ret.assetStatePath, 'utf8'))
  // console.log(JSON.stringify(state, null, 2))
  t.is(state[0].id, newAssetId)
  t.is(state[0].state, 'removeFail')

  fs.unlinkSync(ret.assetStatePath)
  fs.removeSync(ret.assetDataPath)
})

test.serial(
  'AssetManager.9: Agent handles multiple assets changes in desired status',
  async t => {
    let ret = await createAgentWithAssetsDeployed(t, server, NodeRedPort, DummyServerPort, 3, false)
    agent = ret.agent
    let newAssetId = Utils.randomString()
    let assetName = 'asset_1.json'
    const integrity = await Utils.getFileIntegrity(
      path.join(__dirname, 'data', assetName)
    )

    ret.updateRequests.length = 0
    // remove
    let desiredState = delAsset(ret.deviceStates[0], ret.assets[0].id)
    // modify
    let updateId = Utils.randomString()
    desiredState = modifyAsset(
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

    // console.log(JSON.stringify(desiredState, null, 2))

    server.onDeviceStateGet = (req, res) => {
      ret.deviceStates[0] = desiredState
      res.send({ states: ret.deviceStates })
    }

    // send message without meta data will trigger a desired status refresh.
    ret.connector.sendMessage('deviceStateChange', {
      type: 'desired',
      op: 'remove',
      path: 'assets.assets.' + newAssetId,
      state: desiredState.state.assets.assets[newAssetId]
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
  'AssetManager.10: Agent handles multiple re-deploy requests',
  async t => {
    let ret = await createAgentWithAssetsDeployed(t, server, NodeRedPort, DummyServerPort, 1, false)
    agent = ret.agent
    let newAssetId = ret.assets[0].id
    let newAssetName = ret.assets[0].name

    ret.updateRequests.length = 0
    // Deplay again #1
    let updateId1 = Utils.randomString()
    let desiredState = modifyAsset(
      ret.deviceStates[0],
      newAssetId,
      'updateId',
      updateId1
    )
    ret.connector.sendMessage('deviceStateChange', {
      type: 'desired',
      op: 'set',
      path: 'assets.assets.' + newAssetId,
      meta: desiredState.meta,
      state: desiredState.state.assets.assets[newAssetId]
    })

    // Deplay again #2
    let updateId2 = Utils.randomString()
    desiredState = modifyAsset(
      ret.deviceStates[0],
      newAssetId,
      'updateId',
      updateId2
    )
    ret.connector.sendMessage('deviceStateChange', {
      type: 'desired',
      op: 'set',
      path: 'assets.assets.' + newAssetId,
      meta: desiredState.meta,
      state: desiredState.state.assets.assets[newAssetId]
    })

    await waitAssetProcessing(agent, 2000, 10000)

    t.is(
      ret.updateRequests[ret.updateRequests.length - 1].state.state,
      'deployed'
    )
    t.true(fs.existsSync(ret.assetDataPath + '/dst/' + newAssetName))
    const state = JSON.parse(fs.readFileSync(ret.assetStatePath, 'utf8'))
    t.is(state.length, 1)
    t.is(state[0].id, newAssetId)
    t.is(state[0].state, 'deployed')
    t.is(state[0].updateId, updateId2)
    t.true(fs.existsSync(ret.assetDataPath + '/dst/' + newAssetName))

    fs.unlinkSync(ret.assetStatePath)
    fs.removeSync(ret.assetDataPath)
  }
)

test.serial(
  'AssetManager.11: Agent should NOT update reported state if state is identical',
  async t => {
    let ret = await createAgentWithAssetsDeployed(t, server, NodeRedPort, DummyServerPort, 2, false)
    agent = ret.agent

    ret.updateRequests.length = 0

    server.onDeviceStateGet = (req, res) => {
      ret.deviceStates[1] = ret.reportedStates
      res.send({ states: ret.deviceStates })
    }
    // send message without meta data will trigger a state refresh.
    ret.connector.sendMessage('deviceStateChange', {
      type: 'desired',
      op: 'remove',
      state: {}
    })

    await waitAssetProcessing(agent, 1000, 10000)

    t.is(ret.updateRequests.length, 0)

    fs.unlinkSync(ret.assetStatePath)
    fs.removeSync(ret.assetDataPath)
  }
)

test.serial(
  'AssetManager.12: Agent updates reported state if state is different #1',
  async t => {
    let ret = await createAgentWithAssetsDeployed(t, server, NodeRedPort, DummyServerPort, 2, false)
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

    server.onDeviceStateGet = (req, res) => {
      ret.deviceStates[1] = reported
      res.send({ states: ret.deviceStates })
    }

    // send message without meta data will trigger a state refresh.
    ret.connector.sendMessage('deviceStateChange', {
      type: 'desired',
      op: 'remove',
      state: {}
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
  'AssetManager.13: Agent updates reported state if state is different #2',
  async t => {
    let ret = await createAgentWithAssetsDeployed(t, server, NodeRedPort, DummyServerPort, 2, false)
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

    server.onDeviceStateGet = (req, res) => {
      ret.deviceStates[1] = ret.reportedStates
      res.send({ states: ret.deviceStates })
    }
    // send message without meta data will trigger a state refresh.
    ret.connector.sendMessage('deviceStateChange', {
      type: 'desired',
      op: 'remove',
      state: {}
    })

    await waitAssetProcessing(agent, 1000, 10000)

    console.log(JSON.stringify(ret.updateRequests, null, 2))
    t.is(ret.updateRequests[0].path, 'monitoring')
    t.is(ret.updateRequests[1].op, 'remove')
    t.is(ret.updateRequests[1].path, removeStatePath)
    t.is(ret.updateRequests[2].op, 'set')
    t.is(ret.updateRequests[2].state.updateId, oldUpdateId)

    fs.unlinkSync(ret.assetStatePath)
    fs.removeSync(ret.assetDataPath)
  }
)
