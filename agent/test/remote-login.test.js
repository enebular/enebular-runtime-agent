/* @flow */
import test from 'ava'

import RemoteLogin from '../src/remote-login'
import EventEmitter from 'events'
import ConnectorMessenger from '../src/connector-messenger'
import Logger from 'winston'
import LogManager from '../src/log-manager'
import DeviceStateManager from '../src/device-state-manager'
import AgentRunnerManager from '../src/agent-runner-manager'
import Config from '../src/config'

class MockDeviceStateManager extends DeviceStateManager {
  _testType: String = `1`

  updateState(
    type: string,
    op: string,
    path: ?string,
    state: ?Object,
    extRef: ?Object
  ) {}
  getState(
    type: string,
    path: string
    ): ?Object {
      let state = {
        config : {}
      }
      if (type === 'desired' && path === `remoteLogin`) {
        if(this._testType === `1`) {
          state.updateId = `1`
        } else if(this._testType === `2`) {
        } else if(this._testType === `3`) {
          state.config.enable = true
        }
      }
      return state
    }
  setTestType(
    type: string
    ) {
      this._testType = type
    }
}

class MockAgentRunnerManager extends AgentRunnerManager {
  remoteLoginSet(settings: Object) {}
}

class MockConnectorMessenger1 extends ConnectorMessenger {
  sendRequest(
    topic: string,
    body: Object
  ) {
    let obj = {
      hogehoge: "hogehoge"
    }
    return obj
  }
}

class MockConnectorMessenger2 extends ConnectorMessenger {
  sendRequest(
    topic: string,
    body: Object
  ) {
    let obj = {
      keys: {
        id: "1111",
        url: "http://hogehoge.com",
      }
    }
    return obj
  }
}

let connectorMessenger = new ConnectorMessenger()
let connectorMessenger1 = new MockConnectorMessenger1()
let connectorMessenger2 = new MockConnectorMessenger2()
let eventEmitter = new EventEmitter()
let config = new Config('test')
let logManager = new LogManager(config)
let logger = logManager.addLogger(
  'internal',
  ['console', 'enebular', 'file', 'syslog']
)

let mockDeviceStateManager = new MockDeviceStateManager(
  connectorMessenger,
  eventEmitter,
  config,
  logger
)

let agentRunnerManager = new MockAgentRunnerManager(logger, logManager)

test.before(async t => {
})

test.after(t => {
})

test.afterEach.always('cleanup listener', t => {
})

test('_handleSshServerStateChange() no setup', async t => {
  let remoteLogin = new RemoteLogin(
    mockDeviceStateManager,
    connectorMessenger,
    agentRunnerManager,
    logger
  )

  try {
    await remoteLogin._handleSshServerStateChange({params: {active: true}})
  } catch (e) {
    if (e.message === 'not setup') {
      t.pass()
      return
    }
  }

  t.fail()
})

test('_handleSshServerStateChange() param type error', async t => {
  let remoteLogin = new RemoteLogin(
    mockDeviceStateManager,
    connectorMessenger,
    agentRunnerManager,
    logger
  )

  remoteLogin.setup()

  try {
    await remoteLogin._handleSshServerStateChange({params: {active: 1}})
  } catch (e) {
    if (e.message === 'Parameter Type Error') {
      t.pass()
      return
    }
  }

  t.fail()
})

test('_handleSshServerStateChange() parameter true', async t => {
  let remoteLogin = new RemoteLogin(
    mockDeviceStateManager,
    connectorMessenger,
    agentRunnerManager,
    logger
  )

  remoteLogin.setup()

  remoteLogin._remoteLoginState = {
    config: {
      enable: false,
      localUser: 'test',
      localServerPublicKey: {
        id: 'test',
        size: 1,
        signature: 'test'
      },
      relayServer: 'test',
      relayServerPort: 1,
      relayServerUser: 'test',
      relayServerPrivateKey: {
        id: 'test',
        size: 1,
        signature: 'test'
      },
    },
    signature: 'test',
    localServerPublicKeyData: 'test',
    relayServerPrivateKeyData: 'test'
  }

  try {
    await remoteLogin._handleSshServerStateChange({active: true})
  } catch (e) {
    if (e.message === 'Parameter Type Error') {
      t.fail()
      return
    }
  }
  t.pass()
})

test('_handleSshServerStateChange() parameter false', async t => {
  let remoteLogin = new RemoteLogin(
    mockDeviceStateManager,
    connectorMessenger,
    agentRunnerManager,
    logger
  )

  remoteLogin.setup()

  try {
    await remoteLogin._handleSshServerStateChange({active: false})
  } catch (e) {
    if (e.message === 'Parameter Type Error') {
      t.fail()
      return
    }
  }
  t.pass()
})

test('_handleSshClientStateChange() no setup', async t => {
  let remoteLogin = new RemoteLogin(
    mockDeviceStateManager,
    connectorMessenger,
    agentRunnerManager,
    logger
  )

  try {
    await remoteLogin._handleSshClientStateChange({params: {connected: true}})
  } catch (e) {
    if (e.message === 'not setup') {
      t.pass()
      return
    }
  }

  t.fail()
})

test('_handleSshClientStateChange() param type error', async t => {
  let remoteLogin = new RemoteLogin(
    mockDeviceStateManager,
    connectorMessenger,
    agentRunnerManager,
    logger
  )

  remoteLogin.setup()

  try {
    await remoteLogin._handleSshClientStateChange({params: {connected: 1}})
  } catch (e) {
    if (e.message === 'Parameter Type Error') {
      t.pass()
      return
    }
  }

  t.fail()
})

test('_handleSshClientStateChange() parameter true', async t => {
  let remoteLogin = new RemoteLogin(
    mockDeviceStateManager,
    connectorMessenger,
    agentRunnerManager,
    logger
  )

  remoteLogin.setup()

  remoteLogin._remoteLoginState = {
    config: {
      enable: false,
      localUser: 'test',
      localServerPublicKey: {
        id: 'test',
        size: 1,
        signature: 'test'
      },
      relayServer: 'test',
      relayServerPort: 1,
      relayServerUser: 'test',
      relayServerPrivateKey: {
        id: 'test',
        size: 1,
        signature: 'test'
      },
    },
    signature: 'test',
    localServerPublicKeyData: 'test',
    relayServerPrivateKeyData: 'test'
  }

  try {
    await remoteLogin._handleSshClientStateChange({active: true})
  } catch (e) {
    if (e.message === 'Parameter Type Error') {
      t.fail()
      return
    }
  }
  t.pass()
})

test('_handleSshClientStateChange() parameter false', async t => {
  let remoteLogin = new RemoteLogin(
    mockDeviceStateManager,
    connectorMessenger,
    agentRunnerManager,
    logger
  )

  remoteLogin.setup()

  try {
    await remoteLogin._handleSshClientStateChange({active: false})
  } catch (e) {
    if (e.message === 'Parameter Type Error') {
      t.fail()
      return
    }
  }
  t.pass()
})

test('_fetchCert 001', async t => {
  let remoteLogin = new RemoteLogin(
    mockDeviceStateManager,
    connectorMessenger,
    agentRunnerManager,
    logger
  )

  try {
    let ret = await remoteLogin._fetchCert(1)
  } catch (e) {
    console.error("e.message: " + e.message)
    t.pass()
    return
  }

  t.fail()
})

test('_fetchCert 002', async t => {
  let remoteLogin = new RemoteLogin(
    mockDeviceStateManager,
    connectorMessenger,
    agentRunnerManager,
    logger
  )

  try {
    let ret = await remoteLogin._fetchCert("xxxxxxx")
  } catch (e) {
//    console.error("e.message: " + e.message)
    t.pass()
    return
  }
 
  t.fail()
})

test('_fetchCert 003', async t => {
  let remoteLogin = new RemoteLogin(
    mockDeviceStateManager,
    connectorMessenger,
    agentRunnerManager,
    logger
  )

  try {
    let ret = await remoteLogin._fetchCert("http://httpbin.org/get")
  } catch (e) {
    t.fail()
    return
  }

  t.pass()
})

test('_downloadCertificate 001', async t => {
  let remoteLogin = new RemoteLogin(
    mockDeviceStateManager,
    connectorMessenger1,
    agentRunnerManager,
    logger
  )

  try {
    let ret = await remoteLogin._downloadCertificate(1, 1)
  } catch (e) {
    t.pass()
    return
  }

  t.fail()
})

test('_downloadCertificate 002', async t => {
  let remoteLogin = new RemoteLogin(
    mockDeviceStateManager,
    connectorMessenger2,
    agentRunnerManager,
    logger
  )

  var ret
  try {
    ret = await remoteLogin._downloadCertificate("1", "1")
  } catch (e) {
    t.fail()
    return
  }

  console.error("ret: " + JSON.stringify(ret, null, 2))
  t.pass()
})

test('DesiredState has no enable and has updateId' , async t => {
  let remoteLogin = new RemoteLogin(
    mockDeviceStateManager,
    connectorMessenger2,
    agentRunnerManager,
    logger
  )

  mockDeviceStateManager.setTestType(`1`)

  remoteLogin._updateRemoteLoginFromDesiredState()

  t.is(remoteLogin._remoteLoginState.state,"updateFail")

})

test('DesiredState has no enable and no updateId' , async t => {
  let remoteLogin = new RemoteLogin(
    mockDeviceStateManager,
    connectorMessenger2,
    agentRunnerManager,
    logger
  )

  mockDeviceStateManager.setTestType(`2`)

  remoteLogin._updateRemoteLoginFromDesiredState()

  t.falsy(remoteLogin._remoteLoginState.state)

})

test('DesiredState has enable and has updateId' , async t => {
  let remoteLogin = new RemoteLogin(
    mockDeviceStateManager,
    connectorMessenger2,
    agentRunnerManager,
    logger
  )

  mockDeviceStateManager.setTestType(`3`)

  remoteLogin._updateRemoteLoginFromDesiredState()

  t.falsy(remoteLogin._remoteLoginState.state)

})
