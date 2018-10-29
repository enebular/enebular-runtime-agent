/* @flow */
import test from 'ava'
import path from 'path'
import fs from 'fs-extra'
import { Server } from 'net'

import EnebularAgent from '../src/enebular-agent'
import Utils from './helpers/utils'
import DummyServer from './helpers/dummy-server'
import { createConnectedAgent,
         createAuthenticatedAgent, 
         createUnauthenticatedAgent, 
         nodeRedIsAlive,
         polling } from './helpers/agent-helper'

import objectPath from 'object-path'
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

function getEmptyDeviceState(states) {
  return [
    {
      type: 'desired',
      state: {}
    },
    {
      type: 'reported',
      state: {}
    },
    Utils.getDummyStatusState("enebular-agent", agentVer)
  ]
}

function addAsset(desiredState, assetId, fileName, integrity) {
  objectPath.set(desiredState, 'state.assets.assets.' + assetId, {
    updateId: Utils.randomString(),
    ts: Date.now(),
    config: {
      name: fileName,
      type: 'file',
      destPath: 'dst',
      fileTypeConfig: {
        filename: fileName,
        integrity: integrity,
        internalSrcConfig: {
          key: fileName,
          stored: true,
        }
      }
    }
  })
  return Utils.getDummyState('desired', desiredState.state)
}

function delAsset(desiredState, assetId) {
  objectPath.del(desiredState, 'state.assets.assets.' + assetId)
  return Utils.getDummyState('desired', desiredState.state)
}

function modifyAsset(desiredState, assetId, prop, value) {
  objectPath.set(desiredState,
      'state.assets.assets.' + assetId + '.' + prop, value)
  return Utils.getDummyState('desired', desiredState.state)
}

async function initAgent(t, deviceStates, tmpAssetDataPath, tmpAssetStatePath, 
    updateReq, populateDesiredState) {
  server.onDeviceStateGet = (req, res) => {
    populateDesiredState(deviceStates[0])
    res.send({ states: deviceStates })
  }

  server.onDeviceStateUpdate = (req, res) => {
    const result = req.body.updates.map(update => {
      updateReq.push(update)
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
    Utils.addNodeRedPortToConfig({
      ENEBULAR_ASSETS_DATA_PATH: tmpAssetDataPath,
      ENEBULAR_ASSETS_STATE_PATH: tmpAssetStatePath
    }, NodeRedPort),
    DummyServerPort
  )
  agent = ret.agent
  return ret
}

async function waitAssetProcessing(initdelay, timeout) {
  await polling(() => { 
      return !agent._assetManager._getFirstPendingChangeAsset() && !agent._assetManager._processingChanges
  }, initdelay, 1000, timeout)
}

async function createAgentWithAssetsDeployed(t, assetCount, cleanup) {
  let tmpAssetDataPath = '/tmp/tmp-asset-data-' + Utils.randomString()
  let tmpAssetStatePath = '/tmp/tmp-asset-state-' + Utils.randomString()
  let deviceStates = getEmptyDeviceState(['desired', 'reported', 'status'])
  let reportedStates = []
  let assets = []
  let randomDataPath = path.join(__dirname, 'data', 'tmp')
  let assetsCount = assetCount

  if (!fs.existsSync(randomDataPath))
    fs.mkdirSync(randomDataPath)

  for (let i = 0; i < assetsCount; i++) {
    let id = 'random-' + Utils.randomString()
    let p = path.join(__dirname, 'data', 'tmp', id)
    await Utils.createFileOfSize(p, 1024 * 10)
    const integrity = await Utils.getFileIntegrity(p)
    assets.push({
      id: id,
      name: id,
      integrity: integrity
    })
  }
  let ret = await initAgent(t, deviceStates, tmpAssetDataPath, tmpAssetStatePath, reportedStates, (desiredState) => {
    assets.map((asset) => {
      addAsset(desiredState, asset.id, asset.name, asset.integrity)
    })
  })

  await waitAssetProcessing(0, assetsCount * 2000)

  const cacheStates = JSON.parse(fs.readFileSync(tmpAssetStatePath, 'utf8'))
  cacheStates.map((state, index) => {
    t.is(state.id, assets[index].id)
    t.is(state.state, 'deployed')
    t.true(fs.existsSync(tmpAssetDataPath + '/dst/' + assets[index].name))
  })

  if (cleanup) {
    fs.unlinkSync(tmpAssetStatePath)
    fs.removeSync(tmpAssetDataPath)
    fs.removeSync(randomDataPath)
  }

  return {
    assetStatePath: tmpAssetStatePath,
    assetDataPath: tmpAssetDataPath,
    randomDataPath: randomDataPath,
    deviceStates: deviceStates,
    reportedStates: reportedStates,
    assets: assets,
    connector: ret.connector
  }
}

test.serial('AssetManager.1: Agent deploys asset according to desired state', async t => {
  await createAgentWithAssetsDeployed(t, 1, true)
})

test.serial('AssetManager.2: Agent handles asset deploy failure(file integrity)', async t => {
  let tmpAssetDataPath = '/tmp/tmp-asset-data-' + Utils.randomString()
  let tmpAssetStatePath = '/tmp/tmp-asset-state-' + Utils.randomString()
  let newAssetId = Utils.randomString()
  let updateReq = []
  let deviceStates = getEmptyDeviceState(['desired', 'reported', 'status'])
  let assetName = 'asset_1.json'

  await initAgent(t, deviceStates, tmpAssetDataPath, tmpAssetStatePath, updateReq, (desiredState) => {
    addAsset(desiredState, newAssetId, assetName, 'wrong integrity')
  })

  await polling(() => { return updateReq.length > 4 }, 0, 100, 10000)

  // should correctly send 5 reported state since it will retry twice.
  t.is(updateReq[0].state.state, 'deployPending')
  t.is(updateReq[1].state.state, 'deploying')
  t.is(updateReq[2].state.state, 'deployPending')
  t.is(updateReq[3].state.state, 'deploying')
  t.is(updateReq[4].state.state, 'deployFail')

  const state = JSON.parse(fs.readFileSync(tmpAssetStatePath, 'utf8'))
  console.log(JSON.stringify(state, null, 4))
  t.is(state[0].id, newAssetId)
  t.is(state[0].state, 'deployFail')
  t.true(state[0].changeErrMsg.includes('File integrity mismatch'))
  fs.unlinkSync(tmpAssetStatePath)
  fs.removeSync(tmpAssetDataPath)
})

test.serial('AssetManager.3: Agent handles asset deploy failure(download file)', async t => {
  let tmpAssetDataPath = '/tmp/tmp-asset-data-' + Utils.randomString()
  let tmpAssetStatePath = '/tmp/tmp-asset-state-' + Utils.randomString()
  let newAssetId = Utils.randomString()
  let updateReq = []
  let deviceStates = getEmptyDeviceState(['desired', 'reported', 'status'])
  let assetName = 'asset_1.json'
  const integrity = await Utils.getFileIntegrity(path.join(__dirname, 'data', assetName))

  await initAgent(t, deviceStates, tmpAssetDataPath, tmpAssetStatePath, updateReq, (desiredState) => {
    addAsset(desiredState, newAssetId, 'wrong file name', integrity)
  })

  await polling(() => { return updateReq.length > 4 }, 0, 100, 10000)

  // should correctly send 5 reported state since it will retry twice.
  t.is(updateReq[0].state.state, 'deployPending')
  t.is(updateReq[1].state.state, 'deploying')
  t.is(updateReq[2].state.state, 'deployPending')
  t.is(updateReq[3].state.state, 'deploying')
  t.is(updateReq[4].state.state, 'deployFail')

  const state = JSON.parse(fs.readFileSync(tmpAssetStatePath, 'utf8'))
  console.log(JSON.stringify(state, null, 4))
  t.is(state[0].id, newAssetId)
  t.is(state[0].state, 'deployFail')
  t.true(state[0].changeErrMsg.includes('Failed to acquire asset'))
  fs.unlinkSync(tmpAssetStatePath)
  fs.removeSync(tmpAssetDataPath)
})

test.serial('AssetManager.4: Agent deploys multiple assets according to desired state', async t => {
  await createAgentWithAssetsDeployed(t, 20, true)
})

test.serial('AssetManager.5: Agent deploys new asset via deviceStateChange', async t => {
  let tmpAssetDataPath = '/tmp/tmp-asset-data-' + Utils.randomString()
  let tmpAssetStatePath = '/tmp/tmp-asset-state-' + Utils.randomString()
  let deviceStates = getEmptyDeviceState(['desired', 'reported', 'status'])
  let updateReq = []

  let ret = await initAgent(t, deviceStates, tmpAssetDataPath, tmpAssetStatePath,
      updateReq, (desiredState) => {
  })

  t.true(await nodeRedIsAlive(NodeRedPort))

  t.is(updateReq.length, 0)

  let newAssetId = Utils.randomString()
  let assetName = 'asset_1.json'
  const integrity = await Utils.getFileIntegrity(path.join(__dirname, 'data', assetName))

  // Deplay new asset
  let desiredState = addAsset(deviceStates[0], newAssetId, assetName, integrity)
  ret.connector.sendMessage('deviceStateChange', {
    type: 'desired',
    op: 'set',
    path: 'assets.assets.' + newAssetId,
    meta: desiredState.meta,
    state: desiredState.state.assets.assets[newAssetId]
  })

  await polling(() => { 
      return !agent._assetManager._getFirstPendingChangeAsset()
  }, 2000, 1000, 5000)

  const cacheStates = JSON.parse(fs.readFileSync(tmpAssetStatePath, 'utf8'))

  t.is(cacheStates[0].id, newAssetId)
  t.is(cacheStates[0].state, 'deployed')
  fs.unlinkSync(tmpAssetStatePath)
  t.true(fs.existsSync(tmpAssetDataPath + '/dst/asset_1.json'))
  fs.removeSync(tmpAssetDataPath)
})

test.serial('AssetManager.6: Agent re-deploys existing asset via deviceStateChange', async t => {
  let ret = await createAgentWithAssetsDeployed(t, 1, false)
  let newAssetId = ret.assets[0].id
  let newAssetName = ret.assets[0].name

  ret.reportedStates.length = 0
  // Deplay again
  let updateId = Utils.randomString()
  let desiredState = modifyAsset(ret.deviceStates[0], newAssetId, 'updateId', updateId)
  ret.connector.sendMessage('deviceStateChange', {
    type: 'desired',
    op: 'set',
    path: 'assets.assets.' + newAssetId,
    meta: desiredState.meta,
    state: desiredState.state.assets.assets[newAssetId]
  })

  await waitAssetProcessing(2000, 5000)

  await polling(() => { 
      return !agent._assetManager._getFirstPendingChangeAsset()
  }, 2000, 1000, 5000)

  t.is(ret.reportedStates[0].state.state, 'deployPending')
  t.is(ret.reportedStates[1].state.state, 'removing')
  t.is(ret.reportedStates[2].state.state, 'deploying')
  t.is(ret.reportedStates[3].state.state, 'deployed')
  t.true(fs.existsSync(ret.assetDataPath + '/dst/' + newAssetName))
  const state = JSON.parse(fs.readFileSync(ret.assetStatePath, 'utf8'))
  t.is(state[0].id, newAssetId)
  t.is(state[0].state, 'deployed')
  t.is(state[0].updateId, updateId)
  t.true(fs.existsSync(ret.assetDataPath + '/dst/' + newAssetName))

  fs.unlinkSync(ret.assetStatePath)
  fs.removeSync(ret.assetDataPath)
  fs.removeSync(ret.randomDataPath)
})

test.serial('AssetManager.7: Agent removes existing asset via deviceStateChange', async t => {
  let ret = await createAgentWithAssetsDeployed(t, 1, false)
  let newAssetId = ret.assets[0].id
  let newAssetName = ret.assets[0].name

  ret.reportedStates.length = 0

  let desiredState = delAsset(ret.deviceStates[0], newAssetId)
  ret.connector.sendMessage('deviceStateChange', {
    type: 'desired',
    op: 'remove',
    path: 'assets.assets.' + newAssetId,
    meta: desiredState.meta,
    state: desiredState.state.assets.assets[newAssetId]
  })

  await waitAssetProcessing(2000, 5000)

  t.is(ret.reportedStates[0].state.state, 'removePending')
  t.is(ret.reportedStates[1].state.state, 'removing')
  t.is(ret.reportedStates[2].op, 'remove')
  t.false(fs.existsSync(ret.assetDataPath + '/dst/' + newAssetName))
  const state = JSON.parse(fs.readFileSync(ret.assetStatePath, 'utf8'))
  t.true(state.length == 0)

  fs.unlinkSync(ret.assetStatePath)
  fs.removeSync(ret.assetDataPath)
  fs.removeSync(ret.randomDataPath)
})

test.serial('AssetManager.8: Agent handles removing asset failure', async t => {
  let ret = await createAgentWithAssetsDeployed(t, 1, false)
  let newAssetId = ret.assets[0].id
  let newAssetName = ret.assets[0].name
  let newAssetPath = ret.assetDataPath + '/dst/' + newAssetName

  ret.reportedStates.length = 0

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

  await waitAssetProcessing(2000, 5000)

  t.is(ret.reportedStates[0].state.state, 'removePending')
  t.is(ret.reportedStates[1].state.state, 'removing')
  t.is(ret.reportedStates[2].state.state, 'removeFail')
  t.true(fs.existsSync(newAssetPath))
  const state = JSON.parse(fs.readFileSync(ret.assetStatePath, 'utf8'))
  // console.log(JSON.stringify(state, null, 2))
  t.is(state[0].id, newAssetId)
  t.is(state[0].state, 'removeFail')

  fs.unlinkSync(ret.assetStatePath)
  fs.removeSync(ret.assetDataPath)
  fs.removeSync(ret.randomDataPath)
})

test.serial('AssetManager.9: Agent handles multiple assets changes in desired status', async t => {
  let ret = await createAgentWithAssetsDeployed(t, 3, false)
  let newAssetId = Utils.randomString()
  let assetName = 'asset_1.json'
  const integrity = await Utils.getFileIntegrity(path.join(__dirname, 'data', assetName))

  ret.reportedStates.length = 0
  // remove
  let desiredState = delAsset(ret.deviceStates[0], ret.assets[0].id)
  // modify
  let updateId = Utils.randomString()
  desiredState = modifyAsset(ret.deviceStates[0], ret.assets[1].id, 'updateId', updateId)
  // add
  desiredState = addAsset(ret.deviceStates[0], newAssetId, assetName, integrity)

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

  await polling(() => { 
      return !agent._assetManager._getFirstPendingChangeAsset()
  }, 2000, 1000, 5000)

  // console.log(ret.reportedStates)
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
  fs.removeSync(ret.randomDataPath)
})








