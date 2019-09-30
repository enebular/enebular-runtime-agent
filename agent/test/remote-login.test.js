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
  updateState(
    type: string,
    op: string,
    path: ?string,
    state: ?Object,
    extRef: ?Object
  ) {}
}

let connectorMessenger = new ConnectorMessenger()
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

let agentRunnerManager = new AgentRunnerManager(logger, logManager)

test.before(async t => {
})

test.after(t => {
})

test.afterEach.always('cleanup listener', t => {
})

test('_handleSshServerStateChange 001', async t => {
  let remoteLogin = new RemoteLogin(
    mockDeviceStateManager,
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

test('_handleSshServerStateChange 002', async t => {
  let remoteLogin = new RemoteLogin(
    mockDeviceStateManager,
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

test('_handleSshServerStateChange 003', async t => {
  let remoteLogin = new RemoteLogin(
    mockDeviceStateManager,
    agentRunnerManager,
    logger
  )

  remoteLogin.setup()

  let params = { active: true }
  try {
    await remoteLogin._handleSshServerStateChange(params)
  } catch (e) {
    t.fail()
    return
  }

  t.pass()
})

test('_handleSshServerStateChange 004', async t => {
  let remoteLogin = new RemoteLogin(
    mockDeviceStateManager,
    agentRunnerManager,
    logger
  )

  remoteLogin.setup()

  let params = { active: false }
  try {
    await remoteLogin._handleSshServerStateChange(params)
  } catch (e) {
    t.fail()
    return
  }

  t.pass()
})

test('_handleSshClientStateChange 001', async t => {
  let remoteLogin = new RemoteLogin(
    mockDeviceStateManager,
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

test('_handleSshClientStateChange 002', async t => {
  let remoteLogin = new RemoteLogin(
    mockDeviceStateManager,
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

test('_handleSshClientStateChange 003', async t => {
  let remoteLogin = new RemoteLogin(
    mockDeviceStateManager,
    agentRunnerManager,
    logger
  )

  remoteLogin.setup()

  let params = { connected: true }
  try {
    await remoteLogin._handleSshClientStateChange(params)
  } catch (e) {
    t.fail()
    return
  }

  t.pass()
})

test('_handleSshClientStateChange 004', async t => {
  let remoteLogin = new RemoteLogin(
    mockDeviceStateManager,
    agentRunnerManager,
    logger
  )

  remoteLogin.setup()

  let params = { connected: false }
  try {
    await remoteLogin._handleSshClientStateChange(params)
  } catch (e) {
    t.fail()
    return
  }

  t.pass()
})
