import test from 'ava'
import AgentVersion from '../src/agent-version'

test('Version.1: parse', t => {
  t.true(AgentVersion.parse('random') == undefined)
  t.true(AgentVersion.parse('...') == undefined)
  t.true(AgentVersion.parse('..') == undefined)
  t.true(AgentVersion.parse('.1') == undefined)
  t.true(AgentVersion.parse('.1.2.3') == undefined)
  t.true(AgentVersion.parse('1.2.') == undefined)
  t.true(AgentVersion.parse('1..2') == undefined)
  t.true(AgentVersion.parse('1.3.2.') == undefined)
  t.true(AgentVersion.parse('str.3.2') == undefined)
  t.true(AgentVersion.parse('1.str.2') == undefined)
  t.true(AgentVersion.parse('1.3.str') == undefined)
  t.true(AgentVersion.parse('1.3a.5') == undefined)
  t.true(AgentVersion.parse('1a.3.5') == undefined)
  t.true(AgentVersion.parse('1.3.5-rc1') == undefined)
  t.true(AgentVersion.parse('1.3.2') != undefined)
  const version = AgentVersion.parse('10000000.10000001.10000002')
  t.true(version != undefined)
  if (version) {
    t.is(version.major, 10000000)
    t.is(version.minor, 10000001)
    t.is(version.patch, 10000002)
  }
})

function nonNull(version: AgentVersion | undefined): AgentVersion {
  if (!version) throw new Error('null')
  return version
}

test('Version.2: compare', t => {
  const version = AgentVersion.parse('3.4.5')
  if (!version) return
  t.true(version.greaterThan(nonNull(AgentVersion.parse('2.1.4'))))
  t.true(version.greaterThan(nonNull(AgentVersion.parse('2.6.4'))))
  t.true(version.greaterThan(nonNull(AgentVersion.parse('2.1.6'))))
  t.true(version.greaterThan(nonNull(AgentVersion.parse('3.1.6'))))
  t.true(version.greaterThan(nonNull(AgentVersion.parse('3.4.2'))))
  t.false(version.greaterThan(nonNull(AgentVersion.parse('3.4.5'))))
  t.false(version.greaterThan(nonNull(AgentVersion.parse('3.4.6'))))
  t.false(version.greaterThan(nonNull(AgentVersion.parse('4.1.1'))))
  t.false(version.greaterThan(nonNull(AgentVersion.parse('3.11.1'))))

  t.true(version.equals(nonNull(AgentVersion.parse('3.4.5'))))
  t.false(version.equals(nonNull(AgentVersion.parse('2.4.5'))))

  t.true(version.lessThan(nonNull(AgentVersion.parse('3.4.6'))))
  t.true(version.lessThan(nonNull(AgentVersion.parse('4.1.6'))))
  t.true(version.lessThan(nonNull(AgentVersion.parse('4.1.1'))))
  t.true(version.lessThan(nonNull(AgentVersion.parse('3.11.1'))))
  t.false(version.lessThan(nonNull(AgentVersion.parse('3.4.5'))))
  t.false(version.lessThan(nonNull(AgentVersion.parse('3.4.2'))))
  t.false(version.lessThan(nonNull(AgentVersion.parse('3.1.6'))))
  t.false(version.lessThan(nonNull(AgentVersion.parse('2.1.6'))))
  t.false(version.lessThan(nonNull(AgentVersion.parse('2.6.1'))))
  t.false(version.lessThan(nonNull(AgentVersion.parse('2.1.4'))))
})
