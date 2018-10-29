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
  const fileName = 'asset_1.json'
  const _states = states.map(state => {
  switch (state.type) {
    case 'desired':
    case 'reported':
      return {
        type: state.type,
        state: {}
      }
    case 'status':
      return Utils.getDummyStatusState("enebular-agent", agentVer)
    }
  })
  return _states
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

async function initAgent(t, deviceStates, tmpAssetDataPath, tmpAssetStatePath, 
    updateReq, populateDesiredState) {
  server.onDeviceStateGet = (req, res) => {
    deviceStates = getEmptyDeviceState(req.body.states)
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

}

test.serial('AssetManager.1: Agent deploys asset according to desired state', async t => {
  let tmpAssetDataPath = '/tmp/tmp-asset-data-' + Utils.randomString()
  let tmpAssetStatePath = '/tmp/tmp-asset-state-' + Utils.randomString()
  let deviceStates
  let updateReq = []
  let newAssetId = Utils.randomString()
  let assetName = 'asset_1.json'
  const integrity = await Utils.getFileIntegrity(path.join(__dirname, 'data', assetName))

  await initAgent(t, deviceStates, tmpAssetDataPath, tmpAssetStatePath, updateReq, (desiredState) => {
    addAsset(desiredState, newAssetId, assetName, integrity)
  })

  await polling(() => { return updateReq.length > 0 }, 0, 100, 10000)

  t.is(updateReq[0].type, 'reported')
  t.is(updateReq[0].op, 'set')
  t.is(updateReq[0].state.state, 'deployed')

  const state = JSON.parse(fs.readFileSync(tmpAssetStatePath, 'utf8'))
  t.is(state[0].id, newAssetId)
  t.is(state[0].state, 'deployed')
  fs.unlinkSync(tmpAssetStatePath)
  t.true(fs.existsSync(tmpAssetDataPath + '/dst/asset_1.json'))
  fs.removeSync(tmpAssetDataPath)
})

test.serial('AssetManager.2: Agent handles asset deploy failure(file integrity)', async t => {
  let tmpAssetDataPath = '/tmp/tmp-asset-data-' + Utils.randomString()
  let tmpAssetStatePath = '/tmp/tmp-asset-state-' + Utils.randomString()
  let newAssetId = Utils.randomString()
  let updateReq = []
  let deviceStates
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
  let deviceStates
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
  let tmpAssetDataPath = '/tmp/tmp-asset-data-' + Utils.randomString()
  let tmpAssetStatePath = '/tmp/tmp-asset-state-' + Utils.randomString()
  let deviceStates
  let updateReq = []
  let assets = []
  let ramdomDataPath = path.join(__dirname, 'data', 'tmp')
  let assetsCount = 20

  if (!fs.existsSync(ramdomDataPath))
    fs.mkdirSync(ramdomDataPath)

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
  await initAgent(t, deviceStates, tmpAssetDataPath, tmpAssetStatePath, updateReq, (desiredState) => {
    assets.map((asset) => {
      addAsset(desiredState, asset.id, asset.name, asset.integrity)
    })
  })

  await polling(() => { 
      return !agent._assetManager._getFirstPendingChangeAsset()
  }, 0, 1000, assetsCount * 1500)

  const cacheStates = JSON.parse(fs.readFileSync(tmpAssetStatePath, 'utf8'))
  cacheStates.map((state, index) => {
    t.is(state.id, assets[index].id)
    t.is(state.state, 'deployed')
    t.true(fs.existsSync(tmpAssetDataPath + '/dst/' + assets[index].name))
  })

  fs.unlinkSync(tmpAssetStatePath)
  fs.removeSync(tmpAssetDataPath)
  fs.removeSync(ramdomDataPath)
})

test.serial('AssetManager.5: Agent deploys asset via desired state', async t => {
  let tmpAssetDataPath = '/tmp/tmp-asset-data-' + Utils.randomString()
  let tmpAssetStatePath = '/tmp/tmp-asset-state-' + Utils.randomString()
  let deviceStates
  let updateReq = []
  server.onDeviceStateGet = (req, res) => {
    deviceStates = getEmptyDeviceState(req.body.states)
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
  t.true(await nodeRedIsAlive(NodeRedPort))

  t.is(updateReq.length, 0)

  let newAssetId = Utils.randomString()
  let assetName = 'asset_1.json'
  const integrity = await Utils.getFileIntegrity(path.join(__dirname, 'data', assetName))

  let desiredState = await addAsset(deviceStates[0], newAssetId, assetName, integrity)
  ret.connector.sendMessage('deviceStateChange', {
    type: 'desired',
    op: 'set',
    path: 'assets.assets.' + newAssetId,
    meta: desiredState.meta,
    state: desiredState.state.assets.assets[newAssetId]
  })

  await polling(() => { return updateReq.length > 0 }, 0, 100, 5000)

  fs.removeSync(tmpAssetDataPath)
  fs.unlinkSync(tmpAssetStatePath)
})




