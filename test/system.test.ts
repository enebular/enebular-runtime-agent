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
  process.env['ROOT_REQUIRED'] = 'false'
  /* process.env['DEBUG'] = 'debug' */
  process.env['MINIMUM_CHECKING_TIME'] = '2'
  process.env['ENEBULAR_AGENT_USER'] = os.userInfo().username
  process.env['FORCE_UPDATE'] = 'true'

  log = new Log('debug', true)
})

test('System.1: update nodejs version in systemd config file', async t => {
  const system = new System(log)
  const systemConfigSimple = path.resolve(
    './test/data/enebular-agent-enebular.service'
  )
  const tmp = `/tmp/systemd-config-tmp-${Utils.randomString()}`

  await writeFile(tmp, await readFile(systemConfigSimple, 'utf8'), 'utf8')

  await system.updateNodeJSVersionInSystemd('enebular', 'v9.2.1', 'v9.2.0', tmp)

  const data = await readFile(tmp, 'utf8')
  t.true(data.indexOf('v9.2.0') > -1)
  fs.unlinkSync(tmp)
})
