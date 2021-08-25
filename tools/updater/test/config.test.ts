import test from 'ava'
import Config from '../src/config'

test('Config.1: Get', t => {
  const config = new Config()
  t.throws(() => {
    config.getItem('N/A')
  }, {instanceOf: TypeError})
  t.notThrows(() => {
    config.getItem('DEBUG')
  })
  t.throws(() => {
    config.getDescription('N/A')
  }, {instanceOf: TypeError})
  t.notThrows(() => {
    config.getDescription('DEBUG')
  })
  t.is(config.getString('DEBUG'), 'info')
})

test('Config.2: Overridden', t => {
  const config = new Config()
  t.deepEqual(config.getOverriddenItems(), {})
  config.setAutoDetectType('DEBUG', 'new value')
  t.is(Object.keys(config.getOverriddenItems()).length, 1)
  t.true('DEBUG' in config.getOverriddenItems())
})

test('Config.3: Set', t => {
  const config = new Config()
  // string
  t.true(config.createItem('string', 'str', '', true))
  t.true(config.setAutoDetectType('string', 'new path'))
  t.is(config.getString('string'), 'new path')
  t.throws(() => {
    config.getNumber('string')
  }, {instanceOf: TypeError})
  t.throws(() => {
    config.getBoolean('string')
  }, {instanceOf: TypeError})
  t.false(config.setAutoDetectType('string', 'true'))
  t.false(config.setAutoDetectType('string', '1212313'))
  t.false(config.setAutoDetectType('string', ''), 'Skip empty value')
  t.false(config.setAutoDetectType('string', undefined), 'Skip empty value')

  // boolean
  t.true(config.createItem('boolean', false, '', true))
  t.true(config.setAutoDetectType('boolean', 'true'))
  t.true(config.getBoolean('boolean'))
  t.throws(() => {
    config.getNumber('boolean')
  }, {instanceOf: TypeError})
  t.throws(() => {
    config.getString('boolean')
  }, {instanceOf: TypeError})
  t.false(config.setAutoDetectType('boolean', 'abc'))
  t.false(config.setAutoDetectType('boolean', '1212313'))

  // integer
  t.true(config.createItem('integer', 12, '', true))
  t.true(config.setAutoDetectType('integer', '1234'))
  t.is(config.getNumber('integer'), 1234)
  t.throws(() => {
    config.getBoolean('integer')
  }, {instanceOf: TypeError})
  t.throws(() => {
    config.getString('integer')
  }, {instanceOf: TypeError})
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
