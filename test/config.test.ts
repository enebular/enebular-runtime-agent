import test from 'ava'
import Config from '../src/config'

test('Config.1: Get', t => {
  const config = new Config()
  t.true(config.getItem('N/A') === undefined)
  t.false(config.getItem('ENEBULAR_AGENT_INSTALL_DIR') === undefined)
  t.true(config.getDescription('N/A') === undefined)
  t.false(config.getDescription('ENEBULAR_AGENT_INSTALL_DIR') === undefined)
  t.is(
    config.getString('ENEBULAR_AGENT_INSTALL_DIR'),
    '/home/enebular/enebular-runtime-agent'
  )
})

test('Config.2: Overridden', t => {
  const config = new Config()
  t.deepEqual(config.getOverriddenItems(), {})
  config.setAutoDetectType('ENEBULAR_AGENT_INSTALL_DIR', 'new path')
  t.is(Object.keys(config.getOverriddenItems()).length, 1)
  t.true('ENEBULAR_AGENT_INSTALL_DIR' in config.getOverriddenItems())
})

test('Config.3: Set', t => {
  const config = new Config()
  // string
  t.true(config.createItem('string', 'str', '', true))
  t.true(config.setAutoDetectType('string', 'new path'))
  t.is(config.getString('string'), 'new path')
  t.is(config.getNumber('string'), undefined)
  t.is(config.getBoolean('string'), undefined)
  t.false(config.setAutoDetectType('string', 'true'))
  t.false(config.setAutoDetectType('string', '1212313'))
  t.false(config.setAutoDetectType('string', ''), 'Skip empty value')
  t.false(config.setAutoDetectType('string', undefined), 'Skip empty value')

  // boolean
  t.true(config.createItem('boolean', false, '', true))
  t.true(config.setAutoDetectType('boolean', 'true'))
  t.true(config.getBoolean('boolean'))
  t.is(config.getNumber('boolean'), undefined)
  t.is(config.getString('boolean'), undefined)
  t.false(config.setAutoDetectType('boolean', 'abc'))
  t.false(config.setAutoDetectType('boolean', '1212313'))

  // integer
  t.true(config.createItem('integer', 12, '', true))
  t.true(config.setAutoDetectType('integer', '1234'))
  t.is(config.getNumber('integer'), 1234)
  t.is(config.getBoolean('integer'), undefined)
  t.is(config.getString('integer'), undefined)
  t.false(config.setAutoDetectType('integer', 'da'))
  t.false(config.setAutoDetectType('integer', 'true'))
  t.true(
    config.setAutoDetectType(
      'integer',
      '2222222222222222222222222222222222222222221111111111111111111111111111111234'
    )
  )
  t.is(
    config.getNumber('integer'),
    2222222222222222222222222222222222222222221111111111111111111111111111111234
  )
})
