import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import * as rimraf from 'rimraf'
import test from 'ava'
import AgentUpdater from '../src/agent-updater'
import AgentVersion from '../src/agent-version'
import Log from '../src/log'
import Config from '../src/config'
import Migrator from '../src/migrator'
import Utils from '../src/utils'
import Mockhelper from './helper/mock-helper'

test.before(() => {
  process.env['ENEBULAR_TEST'] = 'true'
  process.env['ROOT_REQUIRED'] = 'false'
  process.env['DEBUG'] = 'debug'
  process.env['MINIMUM_CHECKING_TIME'] = '2'
  process.env['ENEBULAR_AGENT_USER'] = os.userInfo().username
  process.env['FORCE_UPDATE'] = 'true'
  process.env['MIGRATION_FILE_PATH'] = path.resolve(
    __dirname,
    './data/test_migrations'
  )
})

test('Migrator.1: migrate awsiot port', async t => {
  const cache = '/tmp/enebular-agent-updater-test-' + Utils.randomString()
  process.env['ENEBULAR_AGENT_UPDATER_CACHE_DIR'] = cache
  const { system, installer } = Mockhelper.createDefaultMocks()
  system.port = 'awsiot'
  system.path = path.resolve('./test/data/fake_agent_awsiot')

  const updater = new AgentUpdater(system, installer, undefined)
  await t.notThrowsAsync(updater.update())

  console.log(`${system.newPath}/node-red/.node-red-config`)
  t.true(fs.existsSync(`${system.newPath}/node-red/.node-red-config`))
  t.true(fs.existsSync(`${system.newPath}/.enebular-assets.json`))
  t.true(fs.existsSync(`${system.newPath}/assets`))
  t.true(fs.existsSync(`${system.newPath}/ports/awsiot/.enebular-config.json`))
  t.true(fs.existsSync(`${system.newPath}/ports/awsiot/config.json`))
  t.true(fs.existsSync(`${system.newPath}/ports/awsiot/certs/ca-cert`))
  t.true(fs.existsSync(`${system.newPath}/ports/awsiot/certs/client-cert`))
  t.true(fs.existsSync(`${system.newPath}/ports/awsiot/certs/private-key`))

  rimraf.sync(cache)
})

test('Migrator.2: migrate pelion port', async t => {
  const cache = '/tmp/enebular-agent-updater-test-' + Utils.randomString()
  process.env['ENEBULAR_AGENT_UPDATER_CACHE_DIR'] = cache
  const { system, installer } = Mockhelper.createDefaultMocks()
  system.agent.version = '2.4.0'
  system.newAgent.version = '2.4.1'
  process.env['PELION_MODE'] = 'developer'
  system.port = 'pelion'
  system.path = path.resolve('./test/data/fake_agent_pelion')

  const updater = new AgentUpdater(system, installer, undefined)
  await t.notThrowsAsync(updater.update())

  t.true(fs.existsSync(`${system.newPath}/node-red/.node-red-config`))
  t.true(
    fs.existsSync(`/home/${system.user}/.enebular-agent/.enebular-config.json`)
  )
  t.true(fs.existsSync(`${system.newPath}/.enebular-assets.json`))
  t.true(fs.existsSync(`${system.newPath}/assets`))
  t.true(fs.existsSync(`${system.newPath}/ports/pelion/.pelion-connector`))
  rimraf.sync(cache)
})

test('Migrator.3: migrator handles nodejs version change in systemd', async t => {
  const cache = '/tmp/enebular-agent-updater-test-' + Utils.randomString()
  process.env['ENEBULAR_AGENT_UPDATER_CACHE_DIR'] = cache
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
  rimraf.sync(cache)
})

test('Migrator.4: migrator handles nodejs version reversion when new agent fails to start', async t => {
  const cache = '/tmp/enebular-agent-updater-test-' + Utils.randomString()
  process.env['ENEBULAR_AGENT_UPDATER_CACHE_DIR'] = cache
  const { system, installer } = Mockhelper.createDefaultMocks()
  system.newAgent.nodejsVersion = 'v9.2.0'
  system.failStartNewAgent = true
  system.path = path.resolve('./test/data/fake_agent_awsiot')

  const updater = new AgentUpdater(system, installer, undefined)
  await t.throwsAsync(updater.update())

  const log = fs.readFileSync(updater.getLogFilePath(), 'utf8')
  t.true(log.indexOf('Migrating nodejs') > -1)
  t.true(log.indexOf('[RESTORE] Migration nodejs') > -1)
  rimraf.sync(cache)
})

test('Migrator.5: migrator applies migrations according to version #1', async t => {
  const cache = '/tmp/enebular-agent-updater-test-' + Utils.randomString()
  process.env['ENEBULAR_AGENT_UPDATER_CACHE_DIR'] = cache
  const { system, installer } = Mockhelper.createDefaultMocks()
  system.agent.version = '2.3.0'
  system.newAgent.version = '2.4.0'
  system.path = path.resolve('./test/data/fake_agent_awsiot')

  const updater = new AgentUpdater(system, installer, undefined)
  await t.notThrowsAsync(updater.update())

  t.true(fs.existsSync(`${system.newPath}/node-red/.node-red-config`))
  t.true(fs.existsSync(`${system.newPath}/ports/awsiot/.enebular-config.json`))
  t.true(fs.existsSync(`${system.newPath}/.enebular-assets.json`))
  t.true(fs.existsSync(`${system.newPath}/assets`))
  t.true(fs.existsSync(`${system.newPath}/ports/awsiot/config.json`))
  t.true(fs.existsSync(`${system.newPath}/ports/awsiot/certs/ca-cert`))
  t.true(fs.existsSync(`${system.newPath}/ports/awsiot/certs/client-cert`))
  t.true(fs.existsSync(`${system.newPath}/ports/awsiot/certs/private-key`))
  rimraf.sync(cache)
})

test('Migrator.6: migrator applies migrations according to version #2', async t => {
  const cache = '/tmp/enebular-agent-updater-test-' + Utils.randomString()
  process.env['ENEBULAR_AGENT_UPDATER_CACHE_DIR'] = cache
  const { system, installer } = Mockhelper.createDefaultMocks()
  system.agent.version = '2.3.0'
  system.newAgent.version = '2.4.1'
  system.path = path.resolve('./test/data/fake_agent_awsiot')

  const updater = new AgentUpdater(system, installer, undefined)
  await t.notThrowsAsync(updater.update())

  t.true(fs.existsSync(`${system.newPath}/node-red/.node-red-config`))
  t.true(
    fs.existsSync(`/home/${system.user}/.enebular-agent/.enebular-config.json`)
  )
  t.true(fs.existsSync(`${system.newPath}/.enebular-assets.json`))
  t.true(fs.existsSync(`${system.newPath}/assets`))
  t.true(fs.existsSync(`${system.newPath}/ports/awsiot/config.json`))
  t.true(fs.existsSync(`${system.newPath}/ports/awsiot/certs/ca-cert`))
  t.true(fs.existsSync(`${system.newPath}/ports/awsiot/certs/client-cert`))
  t.true(fs.existsSync(`${system.newPath}/ports/awsiot/certs/private-key`))
  rimraf.sync(cache)
})

test('Migrator.7: migrator applies migrations according to version #3', async t => {
  const cache = '/tmp/enebular-agent-updater-test-' + Utils.randomString()
  process.env['ENEBULAR_AGENT_UPDATER_CACHE_DIR'] = cache
  const { system, installer } = Mockhelper.createDefaultMocks()
  system.agent.version = '2.4.0'
  system.newAgent.version = '2.4.1'
  system.path = path.resolve('./test/data/fake_agent_awsiot_2.4.0')

  const updater = new AgentUpdater(system, installer, undefined)
  await t.notThrowsAsync(updater.update())

  t.true(fs.existsSync(`${system.newPath}/node-red/.node-red-config`))
  t.true(
    fs.existsSync(`/home/${system.user}/.enebular-agent/.enebular-config.json`)
  )
  t.true(fs.existsSync(`${system.newPath}/.enebular-assets.json`))
  t.true(fs.existsSync(`${system.newPath}/assets`))
  t.true(fs.existsSync(`${system.newPath}/ports/awsiot/config.json`))
  t.true(fs.existsSync(`${system.newPath}/ports/awsiot/certs/ca-cert`))
  t.true(fs.existsSync(`${system.newPath}/ports/awsiot/certs/client-cert`))
  t.true(fs.existsSync(`${system.newPath}/ports/awsiot/certs/private-key`))
  rimraf.sync(cache)
})

test('Migrator.8: update fails if the migration file for the version to update is missing', async t => {
  const cache = '/tmp/enebular-agent-updater-test-' + Utils.randomString()
  process.env['ENEBULAR_AGENT_UPDATER_CACHE_DIR'] = cache
  const { system, installer } = Mockhelper.createDefaultMocks()
  system.agent.version = '2.4.0'
  system.newAgent.version = '2.4.10'
  system.path = path.resolve('./test/data/fake_agent_awsiot_2.4.0')

  const updater = new AgentUpdater(system, installer, undefined)
  const error = await t.throwsAsync(updater.update())
  t.true(error.message.startsWith('No migration file found for'))
  rimraf.sync(cache)
})

test('Migrator.9: Migration fails if migration file parsing fail', async t => {
  const cache = '/tmp/enebular-agent-updater-test-' + Utils.randomString()
  process.env['ENEBULAR_AGENT_UPDATER_CACHE_DIR'] = cache
  const { system, installer } = Mockhelper.createDefaultMocks()
  system.agent.version = '2.4.0'
  system.newAgent.version = '2.4.12'
  system.path = path.resolve('./test/data/fake_agent_awsiot_2.4.0')

  const updater = new AgentUpdater(system, installer, undefined)
  const error = await t.throwsAsync(updater.update())
  t.true(error.message.startsWith('Apply migration files failed'))
  rimraf.sync(cache)
})

test('Migrator.10: migrator handles root user change in systemd', async t => {
  const cache = '/tmp/enebular-agent-updater-test-' + Utils.randomString()
  process.env['ENEBULAR_AGENT_UPDATER_CACHE_DIR'] = cache
  const { system, installer } = Mockhelper.createDefaultMocks()
  system.agent.version = '2.8.0'
  system.newAgent.version = '2.9.0'
  system.path = path.resolve('./test/data/fake_agent_awsiot')

  const updater = new AgentUpdater(system, installer, undefined)
  await t.notThrowsAsync(updater.update())

  t.true(
    fs
      .readFileSync(updater.getLogFilePath(), 'utf8')
      .indexOf('Migrating run enebular-agent as root') > -1
  )
  rimraf.sync(cache)
})
