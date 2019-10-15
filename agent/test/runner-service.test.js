/* @flow */
import test from 'ava'
import sinon from 'sinon'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import Utils from './helpers/utils'

import AgentCoreManager from '../lib/runner/agent-core-manager'
import AgentRunnerService from '../lib/runner/agent-runner-service'
import AgentRunnerLogger from '../lib/runner/agent-runner-logger'

import * as utils from '../lib/runner/utils'

test.before(async t => {
  process.env.ENEBULAR_TEST = true
  process.env.DEBUG = 'debug'
})

test.after(t => {
  sinon.restore()
})

test.serial(
  'AgentRunnerService.1: send request response correctly',
  async t => {
    const agentCoreManager = new AgentCoreManager()
    const log = new AgentRunnerLogger(agentCoreManager)
    const agentRunnerService = new AgentRunnerService(agentCoreManager, log)

    let stub = sinon.stub(agentCoreManager, "sendResponse")

    let request = {
      type: "request",
      body: {
        id: "1",
        taskType: "remoteLoginStatusUpdate",
        settings: {}
      }
    }

    await agentRunnerService.onDataReceived(request)
    t.true(stub.called)
    let response = stub.args[0][0]
    t.true(response.success)

    request.type = 'wrong type'
    await agentRunnerService.onDataReceived(request)
    t.false(stub.calledTwice)

    request.type = 'request'
    request.body.taskType = "wrong task type"
    await agentRunnerService.onDataReceived(request)
    t.true(stub.calledTwice)
    response = stub.args[1][0]
    t.false(response.success)
    t.true(response.error.message === 'Unknown task type: wrong task type')
    t.true(response.error.code === 'ERR_INVALID_TYPE')

    delete request.body.settings
    request.body.taskType = "remoteLoginStatusUpdate"
    await agentRunnerService.onDataReceived(request)
    t.false(stub.calledThrice)
  }
)

test.serial(
  'AgentRunnerService.2: remoteLoginStatusUpdate triggers ssh status update',
  async t => {
    const agentCoreManager = new AgentCoreManager()
    const log = new AgentRunnerLogger(agentCoreManager)
    const agentRunnerService = new AgentRunnerService(agentCoreManager, log)

    const stub = sinon.stub(agentCoreManager, "sendStatusUpdate")

    await (agentRunnerService.onDataReceived({
      type: "request",
      body: {
        id: "1",
        taskType: "remoteLoginStatusUpdate",
        settings: {}
      }
    }))

    t.true(stub.called)
    t.deepEqual(stub.args[0][0], { type: 'sshStatusChanged', status: { active: false } })
  }
)

test.serial(
  'AgentRunnerService.3: rotatePublicKey handles settings error',
  async t => {
    const agentCoreManager = new AgentCoreManager()
    const log = new AgentRunnerLogger(agentCoreManager)
    const agentRunnerService = new AgentRunnerService(agentCoreManager, log)

    const getPublicKeyStub = sinon.stub(utils, 'getPublicKey')
    getPublicKeyStub.returns({
      id: "",
      key: "",
      path: ""
    })

    const stub = sinon.stub(agentCoreManager, "sendResponse")

    let request = {
      type: "request",
      body: {
        id: "1",
        taskType: "rotatePublicKey",
        settings: {}
      }
    }

    await agentRunnerService.onDataReceived(request)
    t.true(stub.called)
    let response = stub.args[0][0]
    t.false(response.success)
    t.true(response.error.message === 'Invalid rotate settings')
    t.true(response.error.code === 'ERR_INVALID_PARAM')

    request.body.settings.id = "abcd.pub"
    await agentRunnerService.onDataReceived(request)
    t.true(stub.calledTwice)
    response = stub.args[1][0]
    t.false(response.success)
    t.true(response.error.message === 'Invalid rotate settings')
    t.true(response.error.code === 'ERR_INVALID_PARAM')

    request.body.settings.key = "key"
    await agentRunnerService.onDataReceived(request)
    t.true(stub.calledThrice)
    response = stub.args[2][0]
    t.false(response.success)
    t.true(response.error.message === 'Invalid rotate settings')
    t.true(response.error.code === 'ERR_INVALID_PARAM')

    request.body.settings.signature = "signature"
    await agentRunnerService.onDataReceived(request)
    response = stub.args[3][0]
    t.false(response.success)
    t.true(response.error.code === 'ERR_INVALID_SIGNATURE')
    t.true(Object.prototype.hasOwnProperty.call(response.error.info, 'publicKeyId'))
    getPublicKeyStub.restore()
  }
)

test.serial(
  'AgentRunnerService.4: rotatePublicKey runs correctly',
  async t => {
    const agentCoreManager = new AgentCoreManager()
    const log = new AgentRunnerLogger(agentCoreManager)
    const agentRunnerService = new AgentRunnerService(agentCoreManager, log)

    const stub = sinon.stub(agentCoreManager, "sendResponse")

    const keyPath = '/tmp'
    const keyName = `public-key-${Utils.randomString()}.pub`
    const keyFullPath = path.resolve(keyPath, keyName)
    const pubKey = fs.readFileSync(
      path.resolve(__dirname, 'data/keys/enebular/pubkey.pem'),
      'utf8'
    )

    fs.writeFileSync(keyFullPath, pubKey, 'utf8')

    const getPublicKeyStub = sinon.stub(utils, 'getPublicKey')
    getPublicKeyStub.returns({
      id: keyName,
      key: pubKey,
      path: keyPath
    })

    const privKey = fs.readFileSync(
      path.resolve(__dirname, 'data/keys/enebular/privkey.pem'),
      'utf8'
    )
 
    const newKeyName = `public-key-${Utils.randomString()}.pub`
    let request = {
      type: "request",
      body: {
        id: "1",
        taskType: "rotatePublicKey",
        settings: {
          id: newKeyName,
          key: "data",
        }
      }
    }

    const sign = crypto.createSign('SHA256')
    sign.update(request.body.settings.key)
    request.body.settings.signature = sign.sign(privKey, 'base64')

    await agentRunnerService.onDataReceived(request)
    t.true(stub.called)
    let response = stub.args[0][0]
    t.true(response.success, 'response send success')
    t.false(fs.existsSync(keyFullPath), 'old public key has been removed')
    const newKeyFullPath = path.resolve(keyPath, newKeyName)
    t.true(fs.existsSync(newKeyFullPath), 'new public key has been installed')
    fs.unlinkSync(newKeyFullPath)
    getPublicKeyStub.restore()
  }
)

test.serial(
  'AgentRunnerService.5: rotatePublicKey handles public key error as expected',
  async t => {
    const agentCoreManager = new AgentCoreManager()
    const log = new AgentRunnerLogger(agentCoreManager)
    const agentRunnerService = new AgentRunnerService(agentCoreManager, log)

    const stub = sinon.stub(agentCoreManager, "sendResponse")

    const keyPath = '/tmp'
    const keyName = `public-key-${Utils.randomString()}.pub`
    const keyFullPath = path.resolve(keyPath, keyName)
    const pubKey = fs.readFileSync(
      path.resolve(__dirname, 'data/keys/enebular/pubkey.pem'),
      'utf8'
    )
    const privKey = fs.readFileSync(
      path.resolve(__dirname, 'data/keys/enebular/privkey.pem'),
      'utf8'
    )

    const getPublicKeyStub = sinon.stub(utils, 'getPublicKey')

    const newKeyName = `public-key-${Utils.randomString()}.pub`
    let request = {
      type: "request",
      body: {
        id: "1",
        taskType: "rotatePublicKey",
        settings: {
          id: newKeyName,
          key: "data",
          signature: "abcd"
        }
      }
    }

    // Failed to get public key
    getPublicKeyStub.throws()

    await agentRunnerService.onDataReceived(request)
    t.true(stub.called)
    let response = stub.args[0][0]
    t.false(response.success, 'response set success to false')
    t.true(response.error.code === 'ERR_INVALID_PUBLIC_KEY')

    getPublicKeyStub.returns({
      id: keyName,
      key: pubKey,
      path: keyPath
    })

    // wrong signature
    request.body.settings.signature = 'wrong signature'
    await agentRunnerService.onDataReceived(request)
    t.true(stub.calledTwice)
    response = stub.args[1][0]
    t.false(response.success, 'response set success to false')
    t.true(response.error.code === 'ERR_INVALID_SIGNATURE')
    t.true(response.error.info.publicKeyId === keyName)

    const sign = crypto.createSign('SHA256')
    sign.update(request.body.settings.key)
    request.body.settings.signature = sign.sign(privKey, 'base64')

    // cannot delete public key
    await agentRunnerService.onDataReceived(request)
    t.true(stub.calledThrice)
    response = stub.args[2][0]
    t.false(response.success, 'response set success to false')
    t.true(response.error.code === 'ERR_DELETE_FILE')
    getPublicKeyStub.restore()
  }
)
