import test from 'ava'
import Config from '../src/config'
import Log from '../src/log'
import AgentUpdater from '../src/agent-updater'
import MockSystem from './mock/system'
import MockAgentInstaller from './mock/agent-installer'
import MockMigrator from './mock/migrator'

test.before(t => {
  process.env['ROOT_REQUIRED'] = 'false'
  process.env['DEBUG'] = 'debug'
  process.env['MINIMUM_CHECKING_TIME'] = '2'
})

test('Updater.1: Throws if install fail', async t => {
  const installer = new MockAgentInstaller()
  installer.failInstall = true

  const updater = new AgentUpdater(
    new MockSystem(),
    installer,
    new MockMigrator()
  )
  const error = await t.throwsAsync(updater.update())
  t.true(error.message.startsWith('Agent Install failed'))
})

test('Updater.2: Throws if build fail', async t => {
  const installer = new MockAgentInstaller()
  installer.failBuild = true

  const updater = new AgentUpdater(
    new MockSystem(),
    installer,
    new MockMigrator()
  )
  const error = await t.throwsAsync(updater.update())
  t.true(error.message.startsWith('Agent Build failed'))
})

test.serial(
  'Updater.3: Throws if old agent stop fail then tries to restart the agent',
  async t => {
    const system = new MockSystem()
    system.failStopAgent = true

    const updater = new AgentUpdater(
      system,
      new MockAgentInstaller(),
      new MockMigrator()
    )
    const error = await t.throwsAsync(updater.update())
    t.true(
      error.message.startsWith('stop agent failed'),
      'Failed because of stopping agent'
    )
    t.is(system.attemptStopAgent, 1, 'Tried to stop agent before updating')
    t.is(system.attemptStartAgent, 1, 'Tried to restart agent')
  }
)

test.serial(
  'Updater.4: Throws if migrate fail then tries to restart the agent',
  async t => {
    const system = new MockSystem()
    const migrator = new MockMigrator()
    migrator.failMigrate = true

    const updater = new AgentUpdater(system, new MockAgentInstaller(), migrator)
    const error = await t.throwsAsync(updater.update())
    t.true(
      error.message.startsWith('migrate failed'),
      'Failed because of migrating'
    )
    t.is(system.attemptStopAgent, 1, 'Tried to stop agent before updating')
    t.is(system.attemptStartAgent, 1, 'Tried to restart agent')
  }
)

test.serial('Updater.5: Throws if new agent flip fail', async t => {
  const system = new MockSystem()
  system.failFlipNewAgent = true

  const updater = new AgentUpdater(
    system,
    new MockAgentInstaller(),
    new MockMigrator()
  )
  const error = await t.throwsAsync(updater.update())
  t.true(error.message.startsWith('flip new agent failed'), 'failed because of flipping failed')
  t.is(system.attemptStopAgent, 1, 'Tried to stop agent before updating')
  t.is(system.attemptFlipNewAgent, 1, 'Tried to flip to new agent')
  t.is(system.attemptStartAgent, 1, 'Tried to restart original agent')
})

test.serial('Updater.6: Throws if new agent start fail', async t => {
  const system = new MockSystem()
  system.failStartNewAgent = true

  const updater = new AgentUpdater(
    system,
    new MockAgentInstaller(),
    new MockMigrator()
  )
  const error = await t.throwsAsync(updater.update())
  t.true(error.message.startsWith('start new agent failed'))
  t.is(system.attemptStopAgent, 1, 'Tried to stop agent before updating')
  t.is(system.attemptFlipNewAgent, 1, 'Tried to flip to new agent')
  t.is(system.attemptStopNewAgent, 1, 'Tried to stop new agent before restore')
  t.is(system.attemptFlipOriginalAgent, 1, 'Tried to flip back to original new agent')
  t.is(system.attemptStartAgent, 1, 'Tried to restart original agent')
  t.is(system.attemptVerifyAgent, 1, 'Tried to make sure original agent restarted')
})

test.serial('Updater.7: Throws if new agent verify fail', async t => {
  const system = new MockSystem()
  system.newAgentIsDead = true

  const updater = new AgentUpdater(
    system,
    new MockAgentInstaller(),
    new MockMigrator()
  )
  const error = await t.throwsAsync(updater.update())
  t.true(error.message.startsWith('Verification failed'))
  t.is(system.attemptStopAgent, 1, 'Tried to stop agent before updating')
  t.is(system.attemptFlipNewAgent, 1, 'Tried to flip to new agent')
  t.is(system.attemptStopNewAgent, 1, 'Tried to stop new agent before restore')
  t.is(system.attemptFlipOriginalAgent, 1, 'Tried to flip back to original new agent')
  t.is(system.attemptStartAgent, 1, 'Tried to restart original agent')
  t.is(system.attemptVerifyAgent, 1, 'Tried to make sure original agent restarted')
})

test.serial('Updater.8: Throws if new agent verification throws error', async t => {
  const system = new MockSystem()
  system.newAgentIsDeadThrows = true

  const updater = new AgentUpdater(
    system,
    new MockAgentInstaller(),
    new MockMigrator()
  )
  const error = await t.throwsAsync(updater.update())
  t.true(error.message.startsWith('expection: new agent is dead'))
  t.is(system.attemptStopAgent, 1, 'Tried to stop agent before updating')
  t.is(system.attemptFlipNewAgent, 1, 'Tried to flip to new agent')
  t.is(system.attemptStopNewAgent, 1, 'Tried to stop new agent before restore')
  t.is(system.attemptFlipOriginalAgent, 1, 'Tried to flip back to original new agent')
  t.is(system.attemptStartAgent, 1, 'Tried to restart original agent')
  t.is(system.attemptVerifyAgent, 1, 'Tried to make sure original agent restarted')
})

test.serial('Updater.9: Ignore new agent stop failure in restore', async t => {
  const system = new MockSystem()
  system.newAgentIsDead = true
  system.failStopNewAgent = true

  const updater = new AgentUpdater(
    system,
    new MockAgentInstaller(),
    new MockMigrator()
  )
  const error = await t.throwsAsync(updater.update())
  t.true(error.message.startsWith('Verification failed'))
  t.is(system.attemptStopAgent, 1, 'Tried to stop agent before updating')
  t.is(system.attemptFlipNewAgent, 1, 'Tried to flip to new agent')
  t.is(system.attemptStopNewAgent, 1, 'Tried to stop new agent before restore')
  t.is(system.attemptFlipOriginalAgent, 1, 'Tried to flip back to original new agent')
  t.is(system.attemptStartAgent, 1, 'Tried to restart original agent')
  t.is(system.attemptVerifyAgent, 1, 'Tried to make sure original agent restarted')
})

test.serial('Updater.10: If flipping back to original agent fail in restore', async t => {
  const system = new MockSystem()
  system.newAgentIsDead = true
  system.failFlipOriginalAgent = true

  const updater = new AgentUpdater(
    system,
    new MockAgentInstaller(),
    new MockMigrator()
  )
  const error = await t.throwsAsync(updater.update())
  t.true(error.message.startsWith('Verification failed'))
  t.true(error.message.indexOf('[Faulty] restore') > -1)
  t.is(system.attemptStopAgent, 1, 'Tried to stop agent before updating')
  t.is(system.attemptFlipNewAgent, 1, 'Tried to flip to new agent')
  t.is(system.attemptStopNewAgent, 1, 'Tried to stop new agent before restore')
  t.is(system.attemptFlipOriginalAgent, 1, 'Tried to flip back to original new agent')
  t.is(system.attemptStartAgent, 0)
  t.is(system.attemptVerifyAgent, 0)
})

test.serial('Updater.11: If both new and original agent fail to start', async t => {
  const system = new MockSystem()
  system.newAgentIsDead = true
  system.agentIsDead = true

  const updater = new AgentUpdater(
    system,
    new MockAgentInstaller(),
    new MockMigrator()
  )
  const error = await t.throwsAsync(updater.update())
  t.true(error.message.startsWith('Verification failed'))
  t.true(error.message.indexOf('[Faulty] restore') > -1)
  t.is(system.attemptStopAgent, 1, 'Tried to stop agent before updating')
  t.is(system.attemptFlipNewAgent, 1, 'Tried to flip to new agent')
  t.is(system.attemptStopNewAgent, 1, 'Tried to stop new agent before restore')
  t.is(system.attemptFlipOriginalAgent, 1, 'Tried to flip back to original new agent')
  t.is(system.attemptStartAgent, 1, 'Tried to restart original agent')
  t.is(system.attemptVerifyAgent, 1, 'Tried to make sure original agent restarted')
})

