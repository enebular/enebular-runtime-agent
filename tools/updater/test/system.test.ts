import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import * as util from 'util'
import test from 'ava'
import Log from '../src/log'
import Utils from '../src/utils'
import System from '../src/system'

let log

const readFile = util.promisify(fs.readFile)
const writeFile = util.promisify(fs.writeFile)

test.before(() => {
  process.env['ENEBULAR_TEST'] = 'true'
  process.env['ROOT_REQUIRED'] = 'false'
  /* process.env['DEBUG'] = 'debug' */
  process.env['MINIMUM_CHECKING_TIME'] = '2'
  process.env['ENEBULAR_AGENT_USER'] = os.userInfo().username
  process.env['FORCE_UPDATE'] = 'true'

  log = new Log('debug', true,
      `/tmp/updater-test-log-system-tmp-${Utils.randomString()}`)
})

test('System.1: update nodejs version in systemd config file', async t => {
  const system = new System(log)
  const systemConfigSample = path.resolve(
    './test/data/enebular-agent-enebular.service'
  )
  const tmp = `/tmp/systemd-config-tmp-${Utils.randomString()}`

  await writeFile(tmp, await readFile(systemConfigSample, 'utf8'), 'utf8')

  await system.updateNodeJSVersionInSystemd('enebular', 'v9.2.1', 'v9.2.0', tmp)

  const data = await readFile(tmp, 'utf8')
  t.true(data.indexOf('v9.2.0') > -1)
  fs.unlinkSync(tmp)
})

test('System.2: update running user in systemd config file', async t => {
  const system = new System(log)
  const systemConfigSample = path.resolve(
    './test/data/enebular-agent-enebular.service'
  )
  const tmp = `/tmp/systemd-config-tmp-${Utils.randomString()}`

  await writeFile(tmp, await readFile(systemConfigSample, 'utf8'), 'utf8')

  await system.updateRunningUserToRootInSystemd('enebular', tmp)

  const data = await readFile(tmp, 'utf8')
  t.true(data.indexOf('User=root') > -1)
  t.true(data.indexOf('--user enebular') > -1)
  const expectedData = await readFile('./test/data/enebular-agent-enebular.service.root', 'utf8')
  t.true(expectedData === data)
  fs.unlinkSync(tmp)
})

test('System.3: reverse running user changed in systemd config file', async t => {
  const system = new System(log)
  const systemConfigSample = path.resolve(
    './test/data/enebular-agent-enebular.service.root'
  )
  const tmp = `/tmp/systemd-config-tmp-${Utils.randomString()}`
  const user = 'enebular'

  await writeFile(tmp, await readFile(systemConfigSample, 'utf8'), 'utf8')
  await system.reverseRunningUserToRootInSystemd(user, tmp)

  const data = await readFile(tmp, 'utf8')
  t.true(data.indexOf(`User=${user}`) > -1)
  t.true(data.indexOf('--user enebular') === -1)
  const expectedData = await readFile('./test/data/enebular-agent-enebular.service', 'utf8')
  t.true(expectedData === data)
  fs.unlinkSync(tmp)
})

test('System.4: update systemd running user handles config file that already up-to-date', async t => {
  const system = new System(log)
  const systemConfigSample = path.resolve(
    './test/data/enebular-agent-enebular.service.root'
  )
  const tmp = `/tmp/systemd-config-tmp-${Utils.randomString()}`

  await writeFile(tmp, await readFile(systemConfigSample, 'utf8'), 'utf8')

  await system.updateRunningUserToRootInSystemd('enebular', tmp)

  const data = await readFile(tmp, 'utf8')
  t.true(data.indexOf('User=root') > -1)
  t.true(data.indexOf('--user enebular') > -1)
  console.log(data)
  const expectedData = await readFile('./test/data/enebular-agent-enebular.service.root', 'utf8')
  t.true(expectedData === data)
  fs.unlinkSync(tmp)
})

test('System.5: reverse running user changed in systemd handles config file that already up-to-date', async t => {
  const system = new System(log)
  const systemConfigSample = path.resolve(
    './test/data/enebular-agent-enebular.service'
  )
  const tmp = `/tmp/systemd-config-tmp-${Utils.randomString()}`
  const user = 'enebular'

  await writeFile(tmp, await readFile(systemConfigSample, 'utf8'), 'utf8')
  await system.reverseRunningUserToRootInSystemd(user, tmp)

  const data = await readFile(tmp, 'utf8')
  t.true(data.indexOf(`User=${user}`) > -1)
  t.true(data.indexOf('--user enebular') === -1)
  const expectedData = await readFile('./test/data/enebular-agent-enebular.service', 'utf8')
  t.true(expectedData === data)
  fs.unlinkSync(tmp)
})



