/* @flow */
import test from 'ava'
import sinon from 'sinon'

import {
  polling,
} from './helpers/agent-helper'

import AgentCoreManager from '../lib/runner/agent-core-manager'
import AgentRunnerService from '../lib/runner/agent-runner-service'
import AgentRunnerLogger from '../lib/runner/agent-runner-logger'

test.before(async t => {
  process.env.ENEBULAR_TEST = true
  process.env.DEBUG = 'debug'
})

test.after(t => {
})

test.serial(
  'AgentRunnerService.1: remoteLoginStatusUpdate triggers ssh status update',
  async t => {
    let agentCoreManager = new AgentCoreManager()
    let log = new AgentRunnerLogger(agentCoreManager)
    let agentRunnerService = new AgentRunnerService(agentCoreManager, log)

    let stub = sinon.stub(agentCoreManager, "sendStatusUpdate")

    agentCoreManager.emit('dataReceived', { 
      type: "request",
      body: {
        id: "1",
        taskType: "remoteLoginStatusUpdate",
        settings: {}
      }
    })
    await polling(() => { return true }, 100, 0, 100)
    t.true(stub.called)
    t.deepEqual(stub.args[0][0], { type: 'sshServerStatusChanged', status: { active: false } })
    t.deepEqual(stub.args[1][0], { type: 'sshClientStatusChanged', status: { active: false } })
  }
)
