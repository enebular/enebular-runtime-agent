import * as os from 'os'
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

test('Installer.1: ', async t => {
  const { system, migrator } = Mockhelper.createDefaultMocks()
  system.newAgent.nodejsVersion = 'v9.2.0'

  const updater = new AgentUpdater(system, undefined, migrator)
  const error = await t.throwsAsync(updater.update())
  t.true(error.message.startsWith('Agent Install failed'))
})
