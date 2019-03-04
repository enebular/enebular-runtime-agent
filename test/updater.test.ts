import test from 'ava'
import Config from '../src/config'
import Log from '../src/log'
import AgentUpdater from '../src/agent-updater'
import MockSystem from './mock/system'
import MockAgentInstaller from './mock/agent-installer'
import MockMigrator from './mock/migrator'
import Mockhelper from './helper/mock-helper'

test.before(t => {
  process.env['ROOT_REQUIRED'] = 'false'
  process.env['DEBUG'] = 'debug'
  process.env['MINIMUM_CHECKING_TIME'] = '2'
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

test.serial(
  'Updater.3: Throws if old agent stop fail then tries to restart the agent',
  async t => {
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
  }
)

test.serial(
  'Updater.4: Throws if migrate fail then tries to restart the agent',
  async t => {
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
  }
)

test.serial('Updater.5: Throws if new agent flip fail', async t => {
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

test.serial('Updater.6: Throws if new agent start fail', async t => {
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
  t.is(
    system.attemptVerifyAgent,
    1,
    'Tried to make sure original agent restarted'
  )
})

test.serial('Updater.7: Throws if new agent verify fail', async t => {
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
  t.is(
    system.attemptVerifyAgent,
    1,
    'Tried to make sure original agent restarted'
  )
})

test.serial(
  'Updater.8: Throws if new agent verification throws error',
  async t => {
    const { system, installer, migrator } = Mockhelper.createDefaultMocks()
    system.newAgentIsDeadThrows = true

    const updater = new AgentUpdater(system, installer, migrator)
    const error = await t.throwsAsync(updater.update())
    t.true(error.message.startsWith('expection: new agent is dead'))
    t.is(system.attemptStopAgent, 1, 'Tried to stop agent before updating')
    t.is(system.attemptFlipNewAgent, 1, 'Tried to flip to new agent')
    t.is(
      system.attemptStopNewAgent,
      1,
      'Tried to stop new agent before restore'
    )
    t.is(
      system.attemptFlipOriginalAgent,
      1,
      'Tried to flip back to original new agent'
    )
    t.is(system.attemptStartAgent, 1, 'Tried to restart original agent')
    t.is(
      system.attemptVerifyAgent,
      1,
      'Tried to make sure original agent restarted'
    )
  }
)

test.serial('Updater.9: Ignore new agent stop failure in restore', async t => {
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
  t.is(
    system.attemptVerifyAgent,
    1,
    'Tried to make sure original agent restarted'
  )
})

test.serial(
  'Updater.10: If flipping back to original agent fail in restore',
  async t => {
    const { system, installer, migrator } = Mockhelper.createDefaultMocks()
    system.newAgentIsDead = true
    system.failFlipOriginalAgent = true

    const updater = new AgentUpdater(system, installer, migrator)
    const error = await t.throwsAsync(updater.update())
    t.true(error.message.startsWith('Verification failed'))
    t.true(error.message.indexOf('[Faulty] restore') > -1)
    t.is(system.attemptStopAgent, 1, 'Tried to stop agent before updating')
    t.is(system.attemptFlipNewAgent, 1, 'Tried to flip to new agent')
    t.is(
      system.attemptStopNewAgent,
      1,
      'Tried to stop new agent before restore'
    )
    t.is(
      system.attemptFlipOriginalAgent,
      1,
      'Tried to flip back to original new agent'
    )
    t.is(system.attemptStartAgent, 0)
    t.is(system.attemptVerifyAgent, 0)
  }
)

test.serial(
  'Updater.11: If both new and original agent fail to start',
  async t => {
    const { system, installer, migrator } = Mockhelper.createDefaultMocks()
    system.newAgentIsDead = true
    system.agentIsDead = true

    const updater = new AgentUpdater(system, installer, migrator)
    const error = await t.throwsAsync(updater.update())
    t.true(error.message.startsWith('Verification failed'))
    t.true(error.message.indexOf('[Faulty] restore') > -1)
    t.is(system.attemptStopAgent, 1, 'Tried to stop agent before updating')
    t.is(system.attemptFlipNewAgent, 1, 'Tried to flip to new agent')
    t.is(
      system.attemptStopNewAgent,
      1,
      'Tried to stop new agent before restore'
    )
    t.is(
      system.attemptFlipOriginalAgent,
      1,
      'Tried to flip back to original new agent'
    )
    t.is(system.attemptStartAgent, 1, 'Tried to restart original agent')
    t.is(
      system.attemptVerifyAgent,
      1,
      'Tried to make sure original agent restarted'
    )
  }
)

test.serial(
  'Updater.12: Update fails if current agent version is newer or same to the version to be updated',
  async t => {
    const { system, installer, migrator } = Mockhelper.createDefaultMocks()
    system.version = '2.0.0'
    system.newVersion = '2.0.0'

    let updater = new AgentUpdater(system, installer, migrator)
    let error = await t.throwsAsync(updater.update())
    t.true(error.message.startsWith('enebular-agent is already the newest version'))

    system.version = '2.0.1'
    system.newVersion = '2.0.0'

    updater = new AgentUpdater(system, installer, migrator)
    error = await t.throwsAsync(updater.update())
    t.true(error.message.startsWith('enebular-agent is already the newest version'))
  }
)

test.serial(
  'Updater.13: Update fails if current agent with pelion port and version is older than 2.4.0',
  async t => {
    const { system, installer, migrator } = Mockhelper.createDefaultMocks()
    system.version = '2.3.0'
    system.newVersion = '2.4.0'
    system.port = 'pelion'

    const updater = new AgentUpdater(system, installer, migrator)
    const error = await t.throwsAsync(updater.update())
    t.true(error.message.startsWith('Updating enebular-agent pelion port is only supported from version 2.4.0'))
  }
)

test.serial(
  'Updater.14: Handles scan agent source failure',
  async t => {
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
  }
)
