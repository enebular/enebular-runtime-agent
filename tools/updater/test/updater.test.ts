import * as os from 'os'
import * as fs from 'fs'
import * as rimraf from 'rimraf'
import test from 'ava'
import AgentUpdater from '../src/agent-updater'
import Mockhelper from './helper/mock-helper'
import Utils from '../src/utils'

test.before(() => {
  process.env['ENEBULAR_TEST'] = 'true'
  process.env['ROOT_REQUIRED'] = 'false'
  process.env['DEBUG'] = 'debug'
  process.env['MINIMUM_CHECKING_TIME'] = '2'
  process.env['ENEBULAR_AGENT_USER'] = os.userInfo().username
})

test('Updater.1: Throws if install fail', async t => {
  const { system, installer, migrator } = Mockhelper.createDefaultMocks()
  installer.failInstall = true

  const updater = new AgentUpdater(system, installer, migrator)
  const error = await t.throwsAsync(updater.update())
  t.true(error.message.startsWith('Agent Install failed'))
})

test('Updater.2: Throws if build fail', async t => {
  const { system, installer, migrator } = Mockhelper.createDefaultMocks()
  installer.failBuild = true

  const updater = new AgentUpdater(system, installer, migrator)
  const error = await t.throwsAsync(updater.update())
  t.true(error.message.startsWith('Agent Build failed'))
})

test('Updater.3: Throws if old agent stop fail then tries to restart the agent', async t => {
  const { system, installer, migrator } = Mockhelper.createDefaultMocks()
  system.failStopAgent = true

  const updater = new AgentUpdater(system, installer, migrator)
  const error = await t.throwsAsync(updater.update())
  t.true(
    error.message.startsWith('stop agent failed'),
    'Failed because of stopping agent'
  )
  t.is(system.attemptStopAgent, 1, 'Tried to stop agent before updating')
  t.is(system.attemptStartAgent, 1, 'Tried to restart agent')
})

test('Updater.4: Throws if migrate fail then tries to restart the agent', async t => {
  const { system, installer, migrator } = Mockhelper.createDefaultMocks()
  migrator.failMigrate = true

  const updater = new AgentUpdater(system, installer, migrator)
  const error = await t.throwsAsync(updater.update())
  t.true(
    error.message.startsWith('migrate failed'),
    'Failed because of migrating'
  )
  t.is(system.attemptStopAgent, 1, 'Tried to stop agent before updating')
  t.is(system.attemptStartAgent, 1, 'Tried to restart agent')
})

test('Updater.5: Throws if new agent flip fail', async t => {
  const { system, installer, migrator } = Mockhelper.createDefaultMocks()
  system.failFlipNewAgent = true

  const updater = new AgentUpdater(system, installer, migrator)
  const error = await t.throwsAsync(updater.update())
  t.true(
    error.message.startsWith('flip new agent failed'),
    'failed because of flipping failed'
  )
  t.is(system.attemptStopAgent, 1, 'Tried to stop agent before updating')
  t.is(system.attemptFlipNewAgent, 1, 'Tried to flip to new agent')
  t.is(system.attemptStartAgent, 1, 'Tried to restart original agent')
})

test('Updater.6: Throws if new agent start fail', async t => {
  const { system, installer, migrator } = Mockhelper.createDefaultMocks()
  system.failStartNewAgent = true

  const updater = new AgentUpdater(system, installer, migrator)
  const error = await t.throwsAsync(updater.update())
  t.true(error.message.startsWith('start new agent failed'))
  t.is(system.attemptStopAgent, 1, 'Tried to stop agent before updating')
  t.is(system.attemptFlipNewAgent, 1, 'Tried to flip to new agent')
  t.is(system.attemptStopNewAgent, 1, 'Tried to stop new agent before restore')
  t.is(
    system.attemptFlipOriginalAgent,
    1,
    'Tried to flip back to original new agent'
  )
  t.is(system.attemptStartAgent, 1, 'Tried to restart original agent')
  t.true(
    system.attemptVerifyAgent > 0,
    'Tried to make sure original agent restarted'
  )
})

test('Updater.7: Throws if new agent verify fail', async t => {
  const { system, installer, migrator } = Mockhelper.createDefaultMocks()
  system.newAgentIsDead = true

  const updater = new AgentUpdater(system, installer, migrator)
  const error = await t.throwsAsync(updater.update())
  t.true(error.message.startsWith('Verification failed'))
  t.is(system.attemptStopAgent, 1, 'Tried to stop agent before updating')
  t.is(system.attemptFlipNewAgent, 1, 'Tried to flip to new agent')
  t.is(system.attemptStopNewAgent, 1, 'Tried to stop new agent before restore')
  t.is(
    system.attemptFlipOriginalAgent,
    1,
    'Tried to flip back to original new agent'
  )
  t.is(system.attemptStartAgent, 1, 'Tried to restart original agent')
  t.true(
    system.attemptVerifyAgent > 0,
    'Tried to make sure original agent restarted'
  )
})

test('Updater.8: Throws if new agent verification throws error', async t => {
  const { system, installer, migrator } = Mockhelper.createDefaultMocks()
  system.newAgentIsDeadThrows = true

  const updater = new AgentUpdater(system, installer, migrator)
  const error = await t.throwsAsync(updater.update())
  t.true(error.message.startsWith('expection: new agent is dead'))
  t.is(system.attemptStopAgent, 1, 'Tried to stop agent before updating')
  t.is(system.attemptFlipNewAgent, 1, 'Tried to flip to new agent')
  t.is(system.attemptStopNewAgent, 1, 'Tried to stop new agent before restore')
  t.is(
    system.attemptFlipOriginalAgent,
    1,
    'Tried to flip back to original new agent'
  )
  t.is(system.attemptStartAgent, 1, 'Tried to restart original agent')
  t.true(
    system.attemptVerifyAgent > 0,
    'Tried to make sure original agent restarted'
  )
})

test('Updater.9: Ignore new agent stop failure in restore', async t => {
  const { system, installer, migrator } = Mockhelper.createDefaultMocks()
  system.newAgentIsDead = true
  system.failStopNewAgent = true

  const updater = new AgentUpdater(system, installer, migrator)
  const error = await t.throwsAsync(updater.update())
  t.true(error.message.startsWith('Verification failed'))
  t.is(system.attemptStopAgent, 1, 'Tried to stop agent before updating')
  t.is(system.attemptFlipNewAgent, 1, 'Tried to flip to new agent')
  t.is(system.attemptStopNewAgent, 1, 'Tried to stop new agent before restore')
  t.is(
    system.attemptFlipOriginalAgent,
    1,
    'Tried to flip back to original new agent'
  )
  t.is(system.attemptStartAgent, 1, 'Tried to restart original agent')
  t.true(
    system.attemptVerifyAgent > 0,
    'Tried to make sure original agent restarted'
  )
})

test('Updater.10: If flipping back to original agent fail in restore', async t => {
  const { system, installer, migrator } = Mockhelper.createDefaultMocks()
  system.newAgentIsDead = true
  system.failFlipOriginalAgent = true

  const updater = new AgentUpdater(system, installer, migrator)
  const error = await t.throwsAsync(updater.update())
  t.true(error.message.startsWith('Verification failed'))
  t.true(error.message.indexOf('[Faulty] restore') > -1)
  t.is(system.attemptStopAgent, 1, 'Tried to stop agent before updating')
  t.is(system.attemptFlipNewAgent, 1, 'Tried to flip to new agent')
  t.is(system.attemptStopNewAgent, 1, 'Tried to stop new agent before restore')
  t.is(
    system.attemptFlipOriginalAgent,
    1,
    'Tried to flip back to original new agent'
  )
  t.is(system.attemptStartAgent, 0)
  t.is(system.attemptVerifyAgent, 0)
})

test('Updater.11: If both new and original agent fail to start', async t => {
  const { system, installer, migrator } = Mockhelper.createDefaultMocks()
  system.newAgentIsDead = true
  system.agentIsDead = true

  const updater = new AgentUpdater(system, installer, migrator)
  const error = await t.throwsAsync(updater.update())
  t.true(error.message.startsWith('Verification failed'))
  t.true(error.message.indexOf('[Faulty] restore') > -1)
  t.is(system.attemptStopAgent, 1, 'Tried to stop agent before updating')
  t.is(system.attemptFlipNewAgent, 1, 'Tried to flip to new agent')
  t.is(system.attemptStopNewAgent, 1, 'Tried to stop new agent before restore')
  t.is(
    system.attemptFlipOriginalAgent,
    1,
    'Tried to flip back to original new agent'
  )
  t.is(system.attemptStartAgent, 1, 'Tried to restart original agent')
  t.true(
    system.attemptVerifyAgent > 0,
    'Tried to make sure original agent restarted'
  )
})

test('Updater.12: Refuse to downgrade', async t => {
  const { system, installer, migrator } = Mockhelper.createDefaultMocks()
  system.agent.version = '2.3.1'
  system.newAgent.version = '2.3.0'

  let updater = new AgentUpdater(system, installer, migrator)
  let error = await t.throwsAsync(updater.update())
  t.true(
    error.message.startsWith('Downgrading enebular-agent is not supported yet')
  )
})

test('Updater.13: Update fails if current agent with pelion port and version is older than 2.4.0', async t => {
  const { system, installer, migrator } = Mockhelper.createDefaultMocks()
  system.agent.version = '2.3.0'
  system.newAgent.version = '2.4.0'
  system.port = 'pelion'

  const updater = new AgentUpdater(system, installer, migrator)
  const error = await t.throwsAsync(updater.update())
  t.true(
    error.message.startsWith(
      'Updating enebular-agent pelion port is only supported from version 2.4.0'
    )
  )
})

test('Updater.14: Requuires --pelion-mode if current agent with pelion port and version is not greater than 2.4.0', async t => {
  const { system, installer, migrator } = Mockhelper.createDefaultMocks()
  system.agent.version = '2.4.0'
  system.newAgent.version = '2.4.1'
  system.port = 'pelion'

  let updater = new AgentUpdater(system, installer, migrator)
  let error = await t.throwsAsync(updater.update())
  t.true(
    error.message.startsWith(
      'Updating enebular-agent pelion port in 2.4.0 requires --pelion-mode to be set'
    )
  )

  process.env['PELION_MODE'] = 'factory'
  updater = new AgentUpdater(system, installer, migrator)
  await t.notThrowsAsync(updater.update())
})

test('Updater.15: Handles agent source scan failure', async t => {
  const { system, installer, migrator } = Mockhelper.createDefaultMocks()
  system.throwsWhenScanOriginalAgent = true

  let updater = new AgentUpdater(system, installer, migrator)
  let error = await t.throwsAsync(updater.update())
  t.true(error.message.startsWith('Scan agent source return error'))

  system.throwsWhenScanOriginalAgent = false
  system.throwsWhenScanNewAgent = true

  updater = new AgentUpdater(system, installer, migrator)
  error = await t.throwsAsync(updater.update())
  t.true(error.message.startsWith('Scan new agent source return error'))
})

test('Updater.16: If the version is same as the version to be updated, skip build and switch only try to start it if not active', async t => {
  const { system, installer, migrator } = Mockhelper.createDefaultMocks()
  system.agent.version = '2.4.0'
  system.newAgent.version = '2.4.0'
  system.serviceIsActive = false

  let updater = new AgentUpdater(system, installer, migrator)
  await t.notThrowsAsync(updater.update())

  t.is(installer.attemptBuild, false, 'Skip build')
  t.is(system.attemptFlipNewAgent, 0, 'Skip flip to new agent')
  t.is(system.attemptStartNewAgent, 1, 'start agent')
  t.true(
    system.attemptVerifyNewAgent > 0,
    'Tried to make sure new agent restarted'
  )
})

test('Updater.17: Tries to restore legacy agent if path found in systemd does not exist', async t => {
  const cache = '/tmp/enebular-agent-updater-test-' + Utils.randomString()
  process.env['ENEBULAR_AGENT_UPDATER_CACHE_DIR'] = cache
  const { system, installer, migrator } = Mockhelper.createDefaultMocks()
  rimraf.sync(system.path)

  let updater = new AgentUpdater(system, installer, migrator)
  let error = await t.throwsAsync(updater.update())
  t.true(error.message.startsWith('enebular-agent path absents'))

  fs.mkdirSync(cache + '/enebular-runtime-agent.old')
  updater = new AgentUpdater(system, installer, migrator)
  await t.notThrowsAsync(updater.update())
  rimraf.sync(cache)
})
