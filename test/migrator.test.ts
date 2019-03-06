import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import * as rimraf from 'rimraf'
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

  t.true(fs.existsSync(`${system.newPath}/node-red/.node-red-config`))
  t.true(fs.existsSync(`${system.newPath}/ports/awsiot/.enebular-config.json`))
  t.true(fs.existsSync(`${system.newPath}/ports/awsiot/.enebular-assets.json`))
  t.true(fs.existsSync(`${system.newPath}/ports/awsiot/assets`))
  t.true(fs.existsSync(`${system.newPath}/ports/awsiot/config.json`))
  t.true(fs.existsSync(`${system.newPath}/ports/awsiot/certs/ca-cert`))
  t.true(fs.existsSync(`${system.newPath}/ports/awsiot/certs/client-cert`))
  t.true(fs.existsSync(`${system.newPath}/ports/awsiot/certs/private-key`))

  rimraf.sync(system.newPath)
})

test('Migrator.2: migrate pelion port', async t => {
  const { system, installer } = Mockhelper.createDefaultMocks()
  system.agent.version = '2.4.0'
  system.newAgent.version = '2.4.1'
  process.env['PELION_MODE'] = 'developer'
  system.port = 'pelion'
  system.path = path.resolve('./test/data/fake_agent_pelion')

  const updater = new AgentUpdater(system, installer, undefined)
  await t.notThrowsAsync(updater.update())

  t.true(fs.existsSync(`${system.newPath}/node-red/.node-red-config`))
  t.true(fs.existsSync(`${system.newPath}/ports/pelion/.enebular-config.json`))
  t.true(fs.existsSync(`${system.newPath}/ports/pelion/.enebular-assets.json`))
  t.true(fs.existsSync(`${system.newPath}/ports/pelion/assets`))
  t.true(fs.existsSync(`${system.newPath}/ports/pelion/.pelion-connector`))
  rimraf.sync(system.newPath)
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
      .indexOf('Migrating nodejs') > -1
  )
  rimraf.sync(system.newPath)
})

test('Migrator.4: migrator handles nodejs version reverse when new agent fails to start', async t => {
  const { system, installer } = Mockhelper.createDefaultMocks()
  system.newAgent.nodejsVersion = 'v9.2.0'
  system.failStartNewAgent = true
  system.path = path.resolve('./test/data/fake_agent_awsiot')

  const updater = new AgentUpdater(system, installer, undefined)
  await t.throwsAsync(updater.update())

  const log = fs.readFileSync(updater.getLogFilePath(), 'utf8')
  t.true(log.indexOf('Migrating nodejs') > -1)
  t.true(log.indexOf('[RESTORE] Migration nodejs') > -1)
  rimraf.sync(system.newPath)
})

test('Migrator.5: migrator applies migrations according to version', async t => {
  const { system, installer } = Mockhelper.createDefaultMocks()
  process.env['MIGRATION_FILE_PATH'] = path.resolve(__dirname, './data/test_migrations')
  system.agent.version = '2.3.0'
  system.newAgent.version = '2.4.0'
  system.path = path.resolve('./test/data/fake_agent_awsiot')

  const updater = new AgentUpdater(system, installer, undefined)
  await t.notThrowsAsync(updater.update())

  t.true(fs.existsSync(`${system.newPath}/node-red/.node-red-config`))
  t.true(fs.existsSync(`/home/${system.user}/.enebular-agent/.enebular-config.json`))
  t.true(fs.existsSync(`${system.newPath}/.enebular-assets.json`))
  t.true(fs.existsSync(`${system.newPath}/ports/awsiot/assets`))
  t.true(fs.existsSync(`${system.newPath}/ports/awsiot/config.json`))
  t.true(fs.existsSync(`${system.newPath}/ports/awsiot/certs/ca-cert`))
  t.true(fs.existsSync(`${system.newPath}/ports/awsiot/certs/client-cert`))
  t.true(fs.existsSync(`${system.newPath}/ports/awsiot/certs/private-key`))

  rimraf.sync(system.newPath)
})

test('Migrator.6: migrator applies migrations according to version', async t => {
  const { system, installer } = Mockhelper.createDefaultMocks()
  process.env['MIGRATION_FILE_PATH'] = path.resolve(__dirname, './data/test_migrations')
  system.agent.version = '2.3.0'
  system.newAgent.version = '2.4.1'
  system.path = path.resolve('./test/data/fake_agent_awsiot')

  const updater = new AgentUpdater(system, installer, undefined)
  await t.notThrowsAsync(updater.update())

  t.true(fs.existsSync(`${system.newPath}/node-red/.node-red-config`))
  t.true(fs.existsSync(`/home/${system.user}/.enebular-agent/.enebular-config.json`))
  t.true(fs.existsSync(`${system.newPath}/.enebular-assets.json`))
  t.true(fs.existsSync(`${system.newPath}/assets`))
  t.true(fs.existsSync(`${system.newPath}/ports/awsiot/config.json`))
  t.true(fs.existsSync(`${system.newPath}/ports/awsiot/certs/ca-cert`))
  t.true(fs.existsSync(`${system.newPath}/ports/awsiot/certs/client-cert`))
  t.true(fs.existsSync(`${system.newPath}/ports/awsiot/certs/private-key`))

  rimraf.sync(system.newPath)
})
