import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import test from 'ava'
import AgentUpdater from '../src/agent-updater'
import Mockhelper from './helper/mock-helper'

test.before(() => {
  process.env['ROOT_REQUIRED'] = 'false'
  /* process.env['DEBUG'] = 'debug' */
  process.env['MINIMUM_CHECKING_TIME'] = '2'
  process.env['ENEBULAR_AGENT_USER'] = os.userInfo().username
  process.env['FORCE_UPDATE'] = 'true'
})

test('Migrator.1: migrate awsiot port', async t => {
  const { system, installer } = Mockhelper.createDefaultMocks()
  system.port = 'awsiot'
  system.path = path.resolve('./test/data/fake_agent_awsiot')

  const updater = new AgentUpdater(system, installer, undefined)
  await t.notThrowsAsync(updater.update())
})

test('Migrator.2: migrate pelion port', async t => {
  const { system, installer } = Mockhelper.createDefaultMocks()
  system.agent.version = '2.4.1'
  system.newAgent.version = '2.4.2'
  system.port = 'pelion'
  system.path = path.resolve('./test/data/fake_agent_pelion')

  const updater = new AgentUpdater(system, installer, undefined)
  await t.notThrowsAsync(updater.update())
})

test('Migrator.3: migrator handles nodejs version change in systemd', async t => {
  const { system, installer } = Mockhelper.createDefaultMocks()
  system.newAgent.nodejsVersion = 'v9.2.0'
  system.path = path.resolve('./test/data/fake_agent_awsiot')

  const updater = new AgentUpdater(system, installer, undefined)
  await t.notThrowsAsync(updater.update())

  t.true(
    fs
      .readFileSync(updater.getLogFilePath(), 'utf8')
      .indexOf('Updating NodeJS version in systemd') > -1
  )
})
