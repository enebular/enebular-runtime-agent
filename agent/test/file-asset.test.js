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

const DummyServerPort = 3008
const NodeRedPort = 4008

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

function getDefaultDesiredState(fileName, integrity) {
  return {
    updateId: Utils.randomString(),
    ts: Date.now(),
    config: {
      name: fileName,
      type: 'file',
      fileTypeConfig: {
        filename: fileName,
        integrity: integrity,
        internalSrcConfig: {
          key: fileName,
          stored: true
        }
      }
    }
  }
}

async function createAssets(count) {
  let assets = []
  for (let i = 0; i < count; i++) {
    let id = 'random-' + Utils.randomString()
    let p = path.join(server._tmpAssetFilePath, id)
    await Utils.createFileOfSize(p, 1024 * 10)
    const integrity = await Utils.getFileIntegrity(p)
    assets.push({
      id: id,
      path: p,
      integrity: integrity
    })
  }
  return assets
}

test.serial(
  'FileAsset.1: Agent deploys asset in specified destination path',
  async t => {
    const ret = await createAgentWithAssetsDeployed(
      t,
      server,
      NodeRedPort,
      DummyServerPort,
      0,
      false
    )
    agent = ret.agent

    const destPathForTest = [
      '/tmp1',
      'tmp2',
      'tmp3/',
      // '/a/b/c/d',
      'random-' + Utils.randomString()
    ]

    const assets = await createAssets(destPathForTest.length)

    let desiredState = {}
    let assetState
    for (let i = 0; i < destPathForTest.length; i++) {
      assetState = getDefaultDesiredState(assets[i].id, assets[i].integrity)
      assetState.config.destPath = destPathForTest[i]
      objectPath.set(
        desiredState,
        'state.assets.assets.' + assets[i].id,
        assetState
      )
    }

    desiredState = Utils.getDummyState('desired', desiredState.state)

    ret.connector.sendMessage('deviceStateChange', {
      type: 'desired',
      op: 'set',
      path: 'assets.assets',
      meta: desiredState.meta,
      state: desiredState.state.assets.assets
    })

    await waitAssetProcessing(ret.agent, 0, 10000)

    for (let i = 0; i < destPathForTest.length; i++) {
      t.true(
        fs.existsSync(
          path.join(
            agent._assetManager.dataDir(),
            destPathForTest[i],
            assets[i].id
          )
        )
      )
      const s = ret.reportedStates.state.assets.assets[assets[i].id]
      t.is(s.state, 'deployed')
    }

    fs.unlinkSync(ret.assetStatePath)
    fs.removeSync(ret.assetDataPath)
  }
)

test.serial(
  'FileAsset.2: Agent deploys asset with integrity check',
  async t => {
    const ret = await createAgentWithAssetsDeployed(
      t,
      server,
      NodeRedPort,
      DummyServerPort,
      0,
      false
    )
    agent = ret.agent

    const TEST_OK = 0
    const TEST_WRONG_INTEGRITY = 1
    const TEST_CRYPT_FILE = 2

    const integrityForTest = [TEST_WRONG_INTEGRITY, TEST_CRYPT_FILE, TEST_OK]

    const assets = await createAssets(integrityForTest.length)

    let desiredState = {}
    let assetState
    for (let i = 0; i < integrityForTest.length; i++) {
      assetState = getDefaultDesiredState(assets[i].id, assets[i].integrity)
      if (integrityForTest[i] === TEST_WRONG_INTEGRITY)
        assetState.config.fileTypeConfig.integrity = integrityForTest[i]
      else if (integrityForTest[i] === TEST_CRYPT_FILE)
        fs.appendFileSync(assets[i].path, 'dsds')
      objectPath.set(
        desiredState,
        'state.assets.assets.' + assets[i].id,
        assetState
      )
    }

    desiredState = Utils.getDummyState('desired', desiredState.state)

    ret.connector.sendMessage('deviceStateChange', {
      type: 'desired',
      op: 'set',
      path: 'assets.assets',
      meta: desiredState.meta,
      state: desiredState.state.assets.assets
    })

    await waitAssetProcessing(ret.agent, 0, 10000)

    for (let i = 0; i < integrityForTest.length; i++) {
      let shouldFail = integrityForTest[i] !== TEST_OK
      if (!shouldFail) {
        t.true(
          fs.existsSync(path.join(agent._assetManager.dataDir(), assets[i].id))
        )
      }
      const s = ret.reportedStates.state.assets.assets[assets[i].id]
      t.is(s.state, shouldFail ? 'deployFail' : 'deployed')
    }

    fs.unlinkSync(ret.assetStatePath)
    fs.removeSync(ret.assetDataPath)
  }
)

test.serial('FileAsset.3: Agent runs pre-deploy hooks correctly', async t => {
  const ret = await createAgentWithAssetsDeployed(
    t,
    server,
    NodeRedPort,
    DummyServerPort,
    0,
    false
  )
  agent = ret.agent

  const cmdForTest = [
    {
      cmd: 'cmd0.sh'
    },
    {
      cmd: 'cmd1.sh'
    },
    {
      cmd: 'cmd2.sh'
    }
  ]

  const assets = await createAssets(cmdForTest.length)

  let desiredState = {}
  let assetState
  for (let i = 0; i < cmdForTest.length; i++) {
    // if asset file is not there, we are pre-deploy hook.
    const content = `#!/bin/bash\n [[ ! -f ${
      assets[i].id
    } ]] && touch pre-hook${i}`
    fs.writeFileSync(path.join(ret.assetDataPath, cmdForTest[i].cmd), content)
    assetState = getDefaultDesiredState(assets[i].id, assets[i].integrity)
    assetState.config.hooks = [
      {
        stage: 'preDeploy',
        type: 'asset',
        assetTypeConfig: {
          assetPath: cmdForTest[i].cmd
        },
        maxTime: 5
      }
    ]
    objectPath.set(
      desiredState,
      'state.assets.assets.' + assets[i].id,
      assetState
    )
  }

  desiredState = Utils.getDummyState('desired', desiredState.state)

  ret.connector.sendMessage('deviceStateChange', {
    type: 'desired',
    op: 'set',
    path: 'assets.assets',
    meta: desiredState.meta,
    state: desiredState.state.assets.assets
  })

  await waitAssetProcessing(ret.agent, 0, 10000)

  for (let i = 0; i < cmdForTest.length; i++) {
    const s = ret.reportedStates.state.assets.assets[assets[i].id]
    t.is(s.state, 'deployed')
    t.true(
      fs.existsSync(path.join(agent._assetManager.dataDir(), 'pre-hook' + i))
    )
  }

  fs.unlinkSync(ret.assetStatePath)
  // fs.removeSync(ret.assetDataPath)
})

test.serial('FileAsset.4: Agent runs post-deploy hooks correctly', async t => {
  const ret = await createAgentWithAssetsDeployed(
    t,
    server,
    NodeRedPort,
    DummyServerPort,
    0,
    false
  )
  agent = ret.agent

  const cmdForTest = [
    {
      cmd: 'cmd0.sh'
    },
    {
      cmd: 'cmd1.sh'
    },
    {
      cmd: 'cmd2.sh'
    }
  ]

  const assets = await createAssets(cmdForTest.length)

  let desiredState = {}
  let assetState
  for (let i = 0; i < cmdForTest.length; i++) {
    // if asset file is there, we are post-deploy hook.
    const content = `#!/bin/bash\n [[ -f ${
      assets[i].id
    } ]] && touch pre-hook${i}`
    fs.writeFileSync(path.join(ret.assetDataPath, cmdForTest[i].cmd), content)
    assetState = getDefaultDesiredState(assets[i].id, assets[i].integrity)
    assetState.config.hooks = [
      {
        stage: 'postDeploy',
        type: 'asset',
        assetTypeConfig: {
          assetPath: cmdForTest[i].cmd
        },
        maxTime: 5
      }
    ]
    objectPath.set(
      desiredState,
      'state.assets.assets.' + assets[i].id,
      assetState
    )
  }

  desiredState = Utils.getDummyState('desired', desiredState.state)

  ret.connector.sendMessage('deviceStateChange', {
    type: 'desired',
    op: 'set',
    path: 'assets.assets',
    meta: desiredState.meta,
    state: desiredState.state.assets.assets
  })

  await waitAssetProcessing(ret.agent, 0, 10000)

  for (let i = 0; i < cmdForTest.length; i++) {
    const s = ret.reportedStates.state.assets.assets[assets[i].id]
    t.is(s.state, 'deployed')
    t.true(
      fs.existsSync(path.join(agent._assetManager.dataDir(), 'pre-hook' + i))
    )
  }

  fs.unlinkSync(ret.assetStatePath)
  fs.removeSync(ret.assetDataPath)
})

test.serial(
  'FileAsset.5: Agent deploys fail if pre/post-deploy hook specify nonexistent command.',
  async t => {
    const ret = await createAgentWithAssetsDeployed(
      t,
      server,
      NodeRedPort,
      DummyServerPort,
      0,
      false
    )
    agent = ret.agent

    const cmdForTest = [
      {
        cmd: 'ls',
        stage: 'preDeploy'
      },
      {
        cmd: 'reboot',
        stage: 'preDeploy'
      },
      {
        cmd: 'rm -rf *',
        stage: 'postDeploy'
      }
    ]

    const assets = await createAssets(cmdForTest.length)

    let desiredState = {}
    let assetState
    for (let i = 0; i < cmdForTest.length; i++) {
      assetState = getDefaultDesiredState(assets[i].id, assets[i].integrity)
      assetState.config.hooks = [
        {
          stage: cmdForTest[i].stage,
          type: 'asset',
          assetTypeConfig: {
            assetPath: cmdForTest[i].cmd
          },
          maxTime: 5
        }
      ]
      objectPath.set(
        desiredState,
        'state.assets.assets.' + assets[i].id,
        assetState
      )
    }

    desiredState = Utils.getDummyState('desired', desiredState.state)

    ret.connector.sendMessage('deviceStateChange', {
      type: 'desired',
      op: 'set',
      path: 'assets.assets',
      meta: desiredState.meta,
      state: desiredState.state.assets.assets
    })

    await waitAssetProcessing(ret.agent, 0, 15000)

    for (let i = 0; i < cmdForTest.length; i++) {
      const s = ret.reportedStates.state.assets.assets[assets[i].id]
      t.is(s.state, 'deployFail')
      t.true(s.message.includes("deploy hooks: Asset doesn't exist"))
    }

    fs.unlinkSync(ret.assetStatePath)
    fs.removeSync(ret.assetDataPath)
  }
)

test.serial(
  'FileAsset.6: Agent terminates hook if command run over time limit.',
  async t => {
    const ret = await createAgentWithAssetsDeployed(
      t,
      server,
      NodeRedPort,
      DummyServerPort,
      0,
      false
    )
    agent = ret.agent

    const cmdForTest = [
      {
        cmd: 'go.sh',
        stage: 'preDeploy'
      },
      {
        cmd: 'go.sh',
        stage: 'postDeploy'
      }
    ]

    fs.writeFileSync(path.join(ret.assetDataPath, 'go.sh'), 'cat /dev/random')
    const assets = await createAssets(cmdForTest.length)

    let desiredState = {}
    let assetState
    for (let i = 0; i < cmdForTest.length; i++) {
      assetState = getDefaultDesiredState(assets[i].id, assets[i].integrity)
      assetState.config.hooks = [
        {
          stage: cmdForTest[i].stage,
          type: 'asset',
          assetTypeConfig: {
            assetPath: cmdForTest[i].cmd
          },
          maxTime: 2
        }
      ]
      objectPath.set(
        desiredState,
        'state.assets.assets.' + assets[i].id,
        assetState
      )
    }

    desiredState = Utils.getDummyState('desired', desiredState.state)

    ret.connector.sendMessage('deviceStateChange', {
      type: 'desired',
      op: 'set',
      path: 'assets.assets',
      meta: desiredState.meta,
      state: desiredState.state.assets.assets
    })

    await waitAssetProcessing(ret.agent, 0, 30000)

    for (let i = 0; i < cmdForTest.length; i++) {
      if (cmdForTest[i].stage === 'postDeploy') {
        // we won't delete the asset file when failed at executing post hooks
        t.true(
          fs.existsSync(path.join(agent._assetManager.dataDir(), assets[i].id))
        )
      }
      const s = ret.reportedStates.state.assets.assets[assets[i].id]
      t.is(s.state, 'deployFail')
      t.true(
        s.message.includes(
          'deploy hooks: Asset execution ended with signal: SIGTERM'
        )
      )
    }

    fs.unlinkSync(ret.assetStatePath)
    fs.removeSync(ret.assetDataPath)
  }
)

test.serial(
  'FileAsset.7: Agent executes asset correctly if exec is specified.',
  async t => {
    const ret = await createAgentWithAssetsDeployed(
      t,
      server,
      NodeRedPort,
      DummyServerPort,
      0,
      false
    )
    agent = ret.agent

    const id = 'random-' + Utils.randomString()
    const p = path.join(server._tmpAssetFilePath, id)
    fs.writeFileSync(p, 'touch asset_is_running')
    const integrity = await Utils.getFileIntegrity(p)
    const asset = {
      id: id,
      path: p,
      integrity: integrity
    }

    let desiredState = {}
    let assetState = getDefaultDesiredState(asset.id, asset.integrity)
    assetState.config.fileTypeConfig.exec = true
    assetState.config.fileTypeConfig.execConfig = {
      maxTime: 3
    }
    objectPath.set(desiredState, 'state.assets.assets.' + asset.id, assetState)

    desiredState = Utils.getDummyState('desired', desiredState.state)

    ret.connector.sendMessage('deviceStateChange', {
      type: 'desired',
      op: 'set',
      path: 'assets.assets',
      meta: desiredState.meta,
      state: desiredState.state.assets.assets
    })

    await waitAssetProcessing(ret.agent, 0, 10000)

    t.true(fs.existsSync(path.join(agent._assetManager.dataDir(), asset.id)))
    const s = ret.reportedStates.state.assets.assets[asset.id]
    t.is(s.state, 'deployed')
    t.true(
      fs.existsSync(
        path.join(agent._assetManager.dataDir(), 'asset_is_running')
      )
    )

    fs.unlinkSync(ret.assetStatePath)
    fs.removeSync(ret.assetDataPath)
  }
)

test.serial(
  'FileAsset.8: Agent terminates asset execution if run over time limit.',
  async t => {
    const ret = await createAgentWithAssetsDeployed(
      t,
      server,
      NodeRedPort,
      DummyServerPort,
      0,
      false
    )
    agent = ret.agent

    const id = 'random-' + Utils.randomString()
    const p = path.join(server._tmpAssetFilePath, id)
    fs.writeFileSync(p, 'cat /dev/random')
    const integrity = await Utils.getFileIntegrity(p)
    const asset = {
      id: id,
      path: p,
      integrity: integrity
    }

    let desiredState = {}
    let assetState = getDefaultDesiredState(asset.id, asset.integrity)
    assetState.config.fileTypeConfig.exec = true
    assetState.config.fileTypeConfig.execConfig = {
      maxTime: 2
    }
    objectPath.set(desiredState, 'state.assets.assets.' + asset.id, assetState)

    desiredState = Utils.getDummyState('desired', desiredState.state)

    ret.connector.sendMessage('deviceStateChange', {
      type: 'desired',
      op: 'set',
      path: 'assets.assets',
      meta: desiredState.meta,
      state: desiredState.state.assets.assets
    })

    await waitAssetProcessing(ret.agent, 0, 15000)

    t.true(fs.existsSync(path.join(agent._assetManager.dataDir(), asset.id)))
    const s = ret.reportedStates.state.assets.assets[asset.id]
    t.is(s.state, 'deployFail')
    t.true(
      s.message.includes(
        'post-install operations on asset: Execution ended with signal: SIGTERM'
      )
    )

    fs.unlinkSync(ret.assetStatePath)
    fs.removeSync(ret.assetDataPath)
  }
)

test.serial(
  'FileAsset.9: Agent executes asset with correct arguments.',
  async t => {
    const ret = await createAgentWithAssetsDeployed(
      t,
      server,
      NodeRedPort,
      DummyServerPort,
      0,
      false
    )
    agent = ret.agent

    const args = 'test args --fix -gc'
    const id = 'random-' + Utils.randomString()
    const p = path.join(server._tmpAssetFilePath, id)
    const content = `#!/bin/bash\n arg="$*"\n echo "$arg" > asset_args`
    fs.writeFileSync(p, content)
    const integrity = await Utils.getFileIntegrity(p)
    const asset = {
      id: id,
      path: p,
      integrity: integrity
    }

    let desiredState = {}
    let assetState = getDefaultDesiredState(asset.id, asset.integrity)
    assetState.config.fileTypeConfig.exec = true
    assetState.config.fileTypeConfig.execConfig = {
      args: args,
      maxTime: 3
    }
    objectPath.set(desiredState, 'state.assets.assets.' + asset.id, assetState)

    desiredState = Utils.getDummyState('desired', desiredState.state)

    ret.connector.sendMessage('deviceStateChange', {
      type: 'desired',
      op: 'set',
      path: 'assets.assets',
      meta: desiredState.meta,
      state: desiredState.state.assets.assets
    })

    await waitAssetProcessing(ret.agent, 0, 10000)

    t.true(fs.existsSync(path.join(agent._assetManager.dataDir(), asset.id)))
    const s = ret.reportedStates.state.assets.assets[asset.id]
    t.is(s.state, 'deployed')
    t.true(
      fs.existsSync(path.join(agent._assetManager.dataDir(), 'asset_args'))
    )
    t.is(
      fs
        .readFileSync(path.join(agent._assetManager.dataDir(), 'asset_args'))
        .toString()
        .trim(),
      args
    )

    fs.unlinkSync(ret.assetStatePath)
    fs.removeSync(ret.assetDataPath)
  }
)

test.serial(
  'FileAsset.10: Agent executes asset with correct environment variables.',
  async t => {
    const ret = await createAgentWithAssetsDeployed(
      t,
      server,
      NodeRedPort,
      DummyServerPort,
      0,
      false
    )
    agent = ret.agent

    const envs = ['TEST_ENV1=abc', 'TEST_ENV2=cba']
    const id = 'random-' + Utils.randomString()
    const p = path.join(server._tmpAssetFilePath, id)
    const content = `#!/bin/bash\n echo "$TEST_ENV1" > asset_env1\n echo "$TEST_ENV2" > asset_env2\n`
    fs.writeFileSync(p, content)
    const integrity = await Utils.getFileIntegrity(p)
    const asset = {
      id: id,
      path: p,
      integrity: integrity
    }

    let desiredState = {}
    let assetState = getDefaultDesiredState(asset.id, asset.integrity)
    assetState.config.fileTypeConfig.exec = true
    assetState.config.fileTypeConfig.execConfig = {
      envs: envs,
      maxTime: 3
    }
    objectPath.set(desiredState, 'state.assets.assets.' + asset.id, assetState)

    desiredState = Utils.getDummyState('desired', desiredState.state)

    ret.connector.sendMessage('deviceStateChange', {
      type: 'desired',
      op: 'set',
      path: 'assets.assets',
      meta: desiredState.meta,
      state: desiredState.state.assets.assets
    })

    await waitAssetProcessing(ret.agent, 0, 10000)

    t.true(fs.existsSync(path.join(agent._assetManager.dataDir(), asset.id)))
    const s = ret.reportedStates.state.assets.assets[asset.id]
    t.is(s.state, 'deployed')
    t.true(
      fs.existsSync(path.join(agent._assetManager.dataDir(), 'asset_env1'))
    )
    t.is(
      fs
        .readFileSync(path.join(agent._assetManager.dataDir(), 'asset_env1'))
        .toString()
        .trim(),
      'abc'
    )
    t.true(
      fs.existsSync(path.join(agent._assetManager.dataDir(), 'asset_env2'))
    )
    t.is(
      fs
        .readFileSync(path.join(agent._assetManager.dataDir(), 'asset_env2'))
        .toString()
        .trim(),
      'cba'
    )

    fs.unlinkSync(ret.assetStatePath)
    fs.removeSync(ret.assetDataPath)
  }
)

test.serial(
  'FileAsset.11: Agent reports deploy failure if asset execution fail.',
  async t => {
    const ret = await createAgentWithAssetsDeployed(
      t,
      server,
      NodeRedPort,
      DummyServerPort,
      0,
      false
    )
    agent = ret.agent

    const id = 'random-' + Utils.randomString()
    const p = path.join(server._tmpAssetFilePath, id)
    const content = `#!/bin/bash\n not_a_commnad`
    fs.writeFileSync(p, content)
    const integrity = await Utils.getFileIntegrity(p)
    const asset = {
      id: id,
      path: p,
      integrity: integrity
    }

    let desiredState = {}
    let assetState = getDefaultDesiredState(asset.id, asset.integrity)
    assetState.config.fileTypeConfig.exec = true
    assetState.config.fileTypeConfig.execConfig = {
      maxTime: 3
    }
    objectPath.set(desiredState, 'state.assets.assets.' + asset.id, assetState)

    desiredState = Utils.getDummyState('desired', desiredState.state)

    ret.connector.sendMessage('deviceStateChange', {
      type: 'desired',
      op: 'set',
      path: 'assets.assets',
      meta: desiredState.meta,
      state: desiredState.state.assets.assets
    })

    await waitAssetProcessing(ret.agent, 0, 10000)

    t.true(fs.existsSync(path.join(agent._assetManager.dataDir(), asset.id)))
    const s = ret.reportedStates.state.assets.assets[asset.id]
    t.is(s.state, 'deployFail')
    t.true(
      s.message.includes(
        'post-install operations on asset: Execution ended with failure exit code'
      )
    )

    fs.unlinkSync(ret.assetStatePath)
    fs.removeSync(ret.assetDataPath)
  }
)
