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
  waitAssetProcessing,
  agentCleanup
} from './helpers/agent-helper'

const DummyServerPort = 3010
const NodeRedPort = 4010

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
  'AssetManager.1: Agent deploys asset according to desired state',
  async t => {
    const ret = await createAgentWithAssetsDeployed(
      t,
      server,
      NodeRedPort,
      DummyServerPort,
      1,
      true
    )
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
        Utils.addFileAssetToDesiredState(
          desiredState,
          newAssetId,
          assetName,
          'wrong integrity'
        )
      }
    )
    agent = ret.agent

    await waitAssetProcessing(agent, 0, 10000)

    console.log(JSON.stringify(updateReq, null, 4))

    t.is(updateReq[1].state.state, 'deploying')
    t.is(updateReq[2].state.state, 'deployPending')
    t.is(updateReq[3].state.state, 'deploying')
    t.is(updateReq[4].state.state, 'deployPending')
    t.is(updateReq[5].state.state, 'deploying')
    t.is(updateReq[6].state.state, 'deployFail')

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
        Utils.addFileAssetToDesiredState(
          desiredState,
          newAssetId,
          'wrong file name',
          integrity
        )
      }
    )
    agent = ret.agent

    await waitAssetProcessing(agent, 0, 10000)

    t.is(updateReq[1].state.state, 'deploying')
    t.is(updateReq[2].state.state, 'deployPending')
    t.is(updateReq[3].state.state, 'deploying')
    t.is(updateReq[4].state.state, 'deployPending')
    t.is(updateReq[5].state.state, 'deploying')
    t.is(updateReq[6].state.state, 'deployFail')

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
    const ret = await createAgentWithAssetsDeployed(
      t,
      server,
      NodeRedPort,
      DummyServerPort,
      20,
      true
    )
    agent = ret.agent
  }
)

test.serial(
  'AssetManager.5: Agent deploys new asset via deviceStateChange',
  async t => {
    let ret = await createAgentWithAssetsDeployed(
      t,
      server,
      NodeRedPort,
      DummyServerPort,
      0,
      false
    )
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
    let ret = await createAgentWithAssetsDeployed(
      t,
      server,
      NodeRedPort,
      DummyServerPort,
      1,
      false
    )
    agent = ret.agent
    let newAssetId = ret.assets[0].id
    let newAssetName = ret.assets[0].name

    ret.updateRequests.length = 0
    // Deplay again
    let updateId = Utils.randomString()
    let desiredState = Utils.modifyDesiredAsset(
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

    t.is(ret.reportedStates.state.assets.assets[newAssetId].state, 'deployed')
    t.is(
      ret.reportedStates.state.assets.assets[newAssetId].updateId,
      updateId
    )
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
    let ret = await createAgentWithAssetsDeployed(
      t,
      server,
      NodeRedPort,
      DummyServerPort,
      1,
      false
    )
    agent = ret.agent
    let newAssetId = ret.assets[0].id
    let newAssetName = ret.assets[0].name

    ret.updateRequests.length = 0

    let desiredState = Utils.delDesiredAsset(ret.deviceStates[0], newAssetId)
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
    t.true(state.length === 0)

    fs.unlinkSync(ret.assetStatePath)
    fs.removeSync(ret.assetDataPath)
  }
)

test.serial('AssetManager.8: Agent handles removing asset failure', async t => {
  let ret = await createAgentWithAssetsDeployed(
    t,
    server,
    NodeRedPort,
    DummyServerPort,
    1,
    false
  )
  agent = ret.agent
  let newAssetId = ret.assets[0].id
  let newAssetName = ret.assets[0].name
  let newAssetPath = ret.assetDataPath + '/dst/' + newAssetName

  ret.updateRequests.length = 0

  // change file to directory which fails the removing
  fs.removeSync(newAssetPath)
  fs.mkdirSync(newAssetPath)

  let desiredState = Utils.delDesiredAsset(ret.deviceStates[0], newAssetId)
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
  'AssetManager.9: Agent removes absent asset via deviceStateChange',
  async t => {
    let ret = await createAgentWithAssetsDeployed(
      t,
      server,
      NodeRedPort,
      DummyServerPort,
      1,
      false
    )
    agent = ret.agent
    const newAssetId = ret.assets[0].id
    const newAssetName = ret.assets[0].name
    const oldUpdateId =
      ret.reportedStates.state.assets.assets[newAssetId].updateId

    ret.updateRequests.length = 0

    let desiredState = Utils.delDesiredAsset(ret.deviceStates[0], newAssetId)
    ret.connector.sendMessage('deviceStateChange', {
      type: 'desired',
      op: 'remove',
      path: 'assets.assets.nonexistent',
    })

    await waitAssetProcessing(agent, 1000, 5000)

    console.log(JSON.stringify(ret.reportedStates, null, 2))
    // causing server side hash mismatch which triggers full state refresh.
    t.is(ret.reportedStates.state.assets.assets[newAssetId].state, 'deployed')
    t.not(
      ret.reportedStates.state.assets.assets[newAssetId].updateId,
      oldUpdateId
    )
    t.true(fs.existsSync(ret.assetDataPath + '/dst/' + newAssetName))
    const state = JSON.parse(fs.readFileSync(ret.assetStatePath, 'utf8'))
    t.true(state.length === 1)

    fs.unlinkSync(ret.assetStatePath)
    fs.removeSync(ret.assetDataPath)
  }
)

test.serial(
  'AssetManager.10: Agent handles multiple re-deploy requests',
  async t => {
    let ret = await createAgentWithAssetsDeployed(
      t,
      server,
      NodeRedPort,
      DummyServerPort,
      1,
      false
    )
    agent = ret.agent
    let newAssetId = ret.assets[0].id
    let newAssetName = ret.assets[0].name

    ret.updateRequests.length = 0
    // Deplay again #1
    let updateId1 = Utils.randomString()
    let desiredState = Utils.modifyDesiredAsset(
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
    desiredState = Utils.modifyDesiredAsset(
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
