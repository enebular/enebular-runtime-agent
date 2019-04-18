/* @flow */
import test from 'ava'
import fs from 'fs-extra'
import path from 'path'
import jwt from 'jsonwebtoken'
import objectPath from 'object-path'

import EnebularAgent from '../../src/enebular-agent'
import ConnectorService from '../../src/connector-service'
import DummyEnebularServer from './dummy-server'
import NodeRedAdminApi from './node-red-admin-api'
import Utils from './utils'

export async function createStartedAgent(
  t: test,
  agentConfig: EnebularAgentConfig
) {
  let connector = new ConnectorService(() => {
    connector.updateActiveState(true)
  })

  agentConfig = Object.assign(Utils.createDefaultAgentConfig(1990), agentConfig)
  let agent = new EnebularAgent({
    portBasePath: path.resolve(__dirname, '../'),
    connector: connector,
    config: agentConfig
  })

  await agent.startup()
  return { agent: agent, connector: connector }
}

export async function createConnectedAgent(
  t: test,
  agentConfig: EnebularAgentConfig,
  ctrlMsgCallback: (message: any) => void
) {
  let connector = new ConnectorService(() => {
    connector.updateActiveState(true)
    connector.updateRegistrationState(true, 'dummy_deviceId')
  })
  agentConfig = Object.assign(Utils.createDefaultAgentConfig(1990), agentConfig)
  let agent = new EnebularAgent({
    portBasePath: path.resolve(__dirname, '../'),
    connector: connector,
    config: agentConfig
  })

  return new Promise(async (resolve, reject) => {
    agent.on('connectorConnect', async () => {
      connector.updateConnectionState(true)
      resolve({ agent: agent, connector: connector })
    })

    agent.on('connectorCtrlMessageSend', msg => {
        if (ctrlMsgCallback)
          ctrlMsgCallback(connector, msg)
    })

    await agent.startup(agentConfig)
    setTimeout(async () => {
      reject(new Error('no connect request.'))
    }, 1000)
  })
}

export async function createAuthenticatedAgent(
  t: test,
  server: DummyEnebularServer,
  agentConfig: EnebularAgentConfig,
  port: number,
  ctrlMsgCallback: (message: any) => void
) {
  let authRequestReceived = false
  const authCallback = req => {
    // console.log("authRequest received.", req);
    let token = jwt.sign({ nonce: req.nonce }, 'dummy')
    authRequestReceived = true
    connector.sendMessage('updateAuth', {
      idToken: token,
      accessToken: 'dummy_access_token',
      state: req.state
    })
  }
  server.on('authRequest', authCallback)

  // An existing registered config
  const configFile = Utils.createDummyEnebularConfig({}, port)
  const { agent, connector } = await createConnectedAgent(
    t,
    Object.assign({ ENEBULAR_CONFIG_PATH: configFile }, agentConfig),
    ctrlMsgCallback
  )
  return new Promise(async (resolve, reject) => {
    setTimeout(async () => {
      fs.unlink(configFile, err => {
        err = null
      })
      t.true(authRequestReceived)
      server.removeListener('authRequest', authCallback)
      resolve({ agent: agent, connector: connector })
    }, 500)
  })
}

export async function createUnauthenticatedAgent(
  t: test,
  server: DummyEnebularServer,
  agentConfig: EnebularAgentConfig,
  port: number,
  ctrlMsgCallback: (message: any) => void
) {
  // An existing registered config
  const configFile = Utils.createDummyEnebularConfig({}, port)
  return createConnectedAgent(
    t,
    Object.assign({ ENEBULAR_CONFIG_PATH: configFile }, agentConfig),
    ctrlMsgCallback
  )
}

export async function waitAssetProcessing(agent, initDelay, timeout) {
  await polling(
    () => {
      return (
        !agent._assetManager._getFirstPendingChangeAsset() &&
        !agent._assetManager._processingChanges
      )
    },
    initDelay,
    1000,
    timeout
  )
}

export async function createAgentWithDummyServerAssetHandler(
  t,
  dummyServer,
  nodeRedPort,
  dummyServerPort,
  deviceStates,
  tmpAssetDataPath,
  tmpAssetStatePath,
  updateReq,
  reportedStates,
  populateDesiredState
) {
  const ctrlMsgCallback = (connector, msg) => {
    if (msg.topic == 'deviceState/device/get') {
      populateDesiredState(deviceStates[0])
      connector.sendCtrlMessage({
        type: 'res',
        id: msg.id,
        res: 'ok',
        body: {
          states: deviceStates
        }
      })
    }
    else if (msg.topic == 'deviceState/device/update') {
      const result = msg.body.updates.map(update => {
        updateReq.push(update)
        if (update.op === 'set') {
          objectPath.set(reportedStates, 'state.' + update.path, update.state)
        } else if (update.op === 'remove') {
          objectPath.del(reportedStates, 'state.' + update.path)
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
    dummyServer,
    Utils.addNodeRedPortToConfig(
      {
        ENEBULAR_ASSETS_DATA_PATH: tmpAssetDataPath,
        ENEBULAR_ASSETS_STATE_PATH: tmpAssetStatePath
      },
      nodeRedPort
    ),
    dummyServerPort,
    ctrlMsgCallback
  )
  return ret
}

export async function createAgentWithAssetsDeployed(
  t,
  server,
  nodeRedPort,
  dummyServerPort,
  assetCount,
  cleanup
) {
  let tmpAssetDataPath = '/tmp/tmp-asset-data-' + Utils.randomString()
  let tmpAssetStatePath = '/tmp/tmp-asset-state-' + Utils.randomString()
  let deviceStates = Utils.getEmptyDeviceState()
  let updateRequests = []
  let reportedStates = { type: 'reported' }
  let assets = []
  let assetsCount = assetCount

  for (let i = 0; i < assetsCount; i++) {
    let id = 'random-' + Utils.randomString()
    let p = path.join(server._tmpAssetFilePath, id)
    await Utils.createFileOfSize(p, 1024 * 10)
    const integrity = await Utils.getFileIntegrity(p)
    assets.push({
      id: id,
      name: id,
      integrity: integrity
    })
  }
  let ret = await createAgentWithDummyServerAssetHandler(
    t,
    server,
    nodeRedPort,
    dummyServerPort,
    deviceStates,
    tmpAssetDataPath,
    tmpAssetStatePath,
    updateRequests,
    reportedStates,
    desiredState => {
      assets.map(asset => {
        Utils.addFileAssetToDesiredState(
          desiredState,
          asset.id,
          asset.name,
          asset.integrity
        )
      })
    }
  )

  await waitAssetProcessing(ret.agent, 0, assetsCount * 2000)

  if (fs.existsSync(tmpAssetStatePath)) {
    const cacheStates = JSON.parse(fs.readFileSync(tmpAssetStatePath, 'utf8'))
    cacheStates.map((state, index) => {
      t.is(state.id, assets[index].id)
      t.is(state.state, 'deployed')
      t.true(fs.existsSync(tmpAssetDataPath + '/dst/' + assets[index].name))
    })
  }

  if (cleanup) {
    fs.unlinkSync(tmpAssetStatePath)
    fs.removeSync(tmpAssetDataPath)
  }

  return {
    assetStatePath: tmpAssetStatePath,
    assetDataPath: tmpAssetDataPath,
    deviceStates: deviceStates,
    updateRequests: updateRequests,
    reportedStates: reportedStates,
    assets: assets,
    connector: ret.connector,
    agent: ret.agent
  }
}

export function polling(callback, initialDelay, interval, timeout) {
  return new Promise((resolve, reject) => {
    const cb = () => {
      const intervalObj = setInterval(async () => {
        if (await callback()) {
          clearInterval(intervalObj)
          resolve(true)
        }
      }, interval)
      setTimeout(async () => {
        clearInterval(intervalObj)
        resolve(false)
        // max waiting time
      }, timeout)
    }
    if (initialDelay) {
      setTimeout(cb, initialDelay)
    } else {
      cb()
    }
  })
}

export function nodeRedIsAlive(port) {
  const callback = async () => {
    const api = new NodeRedAdminApi('http://127.0.0.1:' + port)
    const settings = await api.getSettings()
    return !!settings
  }
  return polling(callback, 0, 500, 30000)
}

export function nodeRedIsDead(port) {
  return new Promise(async (resolve, reject) => {
    const api = new NodeRedAdminApi('http://127.0.0.1:' + port)
    const settings = await api.getSettings()
    resolve(!settings)
  })
}

export function waitNodeRedToDie(port) {
  const callback = async () => {
    const api = new NodeRedAdminApi('http://127.0.0.1:' + port)
    const settings = await api.getSettings()
    return !settings
  }
  return polling(callback, 0, 500, 10000)
}

export async function agentCleanup(agent, nodeRedPort) {
  if (agent) {
    console.log('cleanup: agent')
    await agent.shutdown().catch(error => {
      // ignore the error, we don't care this
      // set to null to avoid 'unused' lint error
      error = null
    })
    agent = null
    if (nodeRedPort) {
      await waitNodeRedToDie(nodeRedPort)
    }
  }
}
