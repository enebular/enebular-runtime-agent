/* @flow */
import fs from 'fs'
import path from 'path'
import awsIot from 'aws-iot-device-sdk'
import crypto from 'crypto'
import net from 'net'
import { version as agentVer } from 'enebular-runtime-agent/package.json'
import { EnebularAgent, ConnectorService } from 'enebular-runtime-agent'
import {
  startup as runnerStartup,
  shutdown as runnerShutdown
} from '../../../agent/lib/runner/index'

const MODULE_NAME = 'aws-iot'

let agent: EnebularAgent
let connector: ConnectorService
let thingName: string
let thingShadow: awsIot.thingShadow
let canRegisterThingShadow: boolean = false
let thingShadowRegistered: boolean = false
let awsIotConnected: boolean = false
let operationResultHandlers = {}
let initRetryInterval = 2 * 1000
let updateRequestIndex = 0
let shutdownRequested = false

/** AWSIoTとの再接続が発生したときにThingShadowを取得するが失敗したときのリトライ間隔と最大リトライ回数を設定する */
const retryIntervalForGettingThingShadow = 3000
const maxRetlyCountForGettingThingShadow = 10

const fromDevicePort = 60000
const toDevicePort = 60001
const toDeviceHost = '127.0.0.1'

function log(level: string, msg: string, ...args: Array<mixed>) {
  args.push({ module: MODULE_NAME })
  agent.log.log(level, msg, ...args)
}

function debug(msg: string, ...args: Array<mixed>) {
  log('debug', msg, ...args)
}

function info(msg: string, ...args: Array<mixed>) {
  log('info', msg, ...args)
}

function error(msg: string, ...args: Array<mixed>) {
  log('error', msg, ...args)
}

export type AWSIoTConfig = {
  thingName: string
}

function handleOperationResult(token, timeout, stat) {
  if (operationResultHandlers.hasOwnProperty(token)) {
    operationResultHandlers[token](timeout, stat)
    delete operationResultHandlers[token]
  }
}

async function endThingShadow() {
  return new Promise((resolve, reject) => {
    thingShadow.end(false, () => {
      resolve()
    })
  })
}

function createThingShadowReportedStateRoot(state) {
  return { state: { reported: state } }
}

function createThingShadowReportedState(state) {
  return createThingShadowReportedStateRoot({ enebular: state })
}

function createThingShadowReportedAwsIotConnectedState(connected) {
  return createThingShadowReportedState({
    awsiot: { connected: connected }
  })
}

function createThingShadowReportedAgentInfo(info) {
  return createThingShadowReportedState({
    agent: info
  })
}

async function _updateThingShadow(state, retryInterval, index) {
  const disableRetry = retryInterval === 0
  retryInterval = Math.min(retryInterval, 4 * 60 * 60 * 1000)
  return new Promise((resolve, reject) => {
    const _state = Object.assign({}, state)
    let token = thingShadow.update(thingName, _state)
    if (token === null) {
      if (shutdownRequested || disableRetry) {
        error(`Shadow update request failed`)
        resolve()
      } else {
        error(
          `Shadow update request failed, retrying update ${index} (in ${retryInterval /
            1000}sec)...`
        )
        setTimeout(async () => {
          await _updateThingShadow(state, retryInterval * 2, index)
          resolve()
        }, retryInterval)
      }
    } else {
      debug(`Shadow update requested (${token})`)
      operationResultHandlers[token] = (timeout, stat) => {
        info('Shadow update result, timeout:' + timeout + ' state:' + stat)
        if (timeout || stat !== 'accepted') {
          if (shutdownRequested || disableRetry) {
            error(`Shadow update failed`)
            resolve()
          } else {
            error(
              `Shadow update failed, retrying update ${index} (in ${retryInterval /
                1000}sec)...`
            )
            setTimeout(async () => {
              await _updateThingShadow(state, retryInterval * 2, index)
              resolve()
            }, retryInterval)
          }
        } else {
          resolve()
        }
      }
    }
  })
}

async function updateThingShadow(state) {
  return _updateThingShadow(state, 0, updateRequestIndex++)
}

async function updateThingShadowRetry(state) {
  return _updateThingShadow(state, initRetryInterval, updateRequestIndex++)
}

async function updateThingShadowReportedRoot(reportedState) {
  return updateThingShadow(createThingShadowReportedStateRoot(reportedState))
}

async function updateThingShadowReportedAwsIotConnectedState(
  connected: boolean
) {
  debug(
    `Updating shadow AWS IoT connection state to: ${
      connected ? 'connected' : 'disconnected'
    }`
  )
  return updateThingShadowRetry(
    createThingShadowReportedAwsIotConnectedState(connected)
  )
}

async function updateThingShadowReportedAgentInfo() {
  const info = {
    type: 'enebular-agent',
    v: agentVer
  }
  return updateThingShadowRetry(createThingShadowReportedAgentInfo(info))
}

function handleThingShadowRegisterStateChange(registered: boolean) {
  if (registered === thingShadowRegistered) {
    return
  }
  thingShadowRegistered = registered
  info('Thing shadow ' + (registered ? 'registered' : 'unregistered'))
  connector.updateConnectionState(registered)
}

async function updateThingShadowRegisterState() {
  let register = awsIotConnected && canRegisterThingShadow
  if (register === thingShadowRegistered) {
    return
  }
  if (register) {
    thingShadow.register(
      thingName,
      {
        ignoreDeltas: false,
        persistentSubscribe: true
      },
      async err => {
        handleThingShadowRegisterStateChange(!err)
        if (!err) {
          await updateThingShadowReportedAwsIotConnectedState(true)
          updateThingShadowReportedAgentInfo()
        }
      }
    )
  } else {
    updateThingShadowReportedAwsIotConnectedState(false)
    thingShadow.unregister(thingName)
    handleThingShadowRegisterStateChange(false)
  }
}

function handleStateMessageChange(messageJSON: string) {
  try {
    const { messageType, message } = JSON.parse(messageJSON)
    debug('Message: ' + messageType)
    connector.sendMessage(messageType, message)
  } catch (err) {
    error('Message parse failed. ' + err)
  }
  updateThingShadowReportedRoot({ message: messageJSON })
}

function handleDeviceCommandMessage(messageJSON: string) {
  try {
    connector.sendMessage(`deviceCommandSend`, JSON.parse(messageJSON))
  } catch (err) {
    error('Message parse failed. ' + err)
  }
}

function getThingShadowAfterAWSIoTConnected(thingName, count = 0) {
  if (count > maxRetlyCountForGettingThingShadow) {
    error(`Failed to get latest shadow version (tried ${count} times)`)
    return
  }
  info(`Getting thing shadow (try count: ${count + 1})`)
  let token = thingShadow.get(thingName)
  if (token !== null) {
    operationResultHandlers[token] = (timeout, stat) => {
      if (!timeout && stat === 'accepted') {
        updateThingShadowReportedAwsIotConnectedState(true)
      } else {
        error('Failed to get latest shadow version')
      }
    }
  } else {
    setTimeout(() => {
      getThingShadowAfterAWSIoTConnected(thingName, count + 1)
    }, retryIntervalForGettingThingShadow)
  }
}

function setupThingShadow(config: AWSIoTConfig) {
  /**
   * Add a MQTT Last Will and Testament (LWT) so that the connection state in
   * the shadow can be updated if the agent abruptly disconnects.
   */
  let willPayload = createThingShadowReportedAwsIotConnectedState(false)
  config['will'] = {
    topic: `enebular/things/${config.thingName}/shadow/update`,
    payload: JSON.stringify(willPayload)
  }
  const shadow = awsIot.thingShadow(config)
  const toDeviceTopic = `enebular/things/${thingName}/msg/to_device`
  const deviceCommandSendTopic = `enebular/things/${thingName}/msg/command`
  const cloudSendTopic = `enebular/to-agent/${thingName}`
  const deviceSendTopic = `$aws/rules/enebular_agent_to_cloud`

  shadow.subscribe(toDeviceTopic)
  shadow.subscribe(deviceCommandSendTopic)
  shadow.subscribe(cloudSendTopic)

  const nodeRedRecvServer = new net.Server()
  const nodeRedSendClient = new net.Socket()

  shadow.on('connect', () => {
    info('Connected to AWS IoT')
    let thingShadowAlreadyRegistered = thingShadowRegistered

    awsIotConnected = true
    updateThingShadowRegisterState()

    nodeRedRecvServer.listen(fromDevicePort, function() {
      debug('Started waiting for message server for AWS IoT')
    })

    /**
     * If this 'connect' has occured while the agent is already up and running,
     * then it signals that the agent has been disconnected from AWS IoT for a
     * while and the LWT may have been executed resulting in the shadow now
     * reporting a disconnected status.
     *
     * It therefore needs to be updated, and we do that by first 'getting' the
     * shadow (to make sure we have the latest version) and then updating it.
     */
    if (thingShadowAlreadyRegistered) {
      getThingShadowAfterAWSIoTConnected(thingName)
    }
  })

  shadow.on('offline', () => {
    debug('AWS IoT connection offline')
    // ignoring disconnect
  })

  shadow.on('close', () => {
    debug('AWS IoT connection closed')
    // ignoring disconnect
  })

  shadow.on('reconnect', () => {
    debug('Reconnecting to AWS IoT')
  })

  shadow.on('error', error => {
    debug('AWS IoT connection error: ' + error)
  })

  shadow.on('timeout', async (thingName, clientToken) => {
    debug(`AWS IoT operation timeout (${clientToken})`)
    handleOperationResult(clientToken, true)
  })

  shadow.on('status', async (thingName, stat, clientToken, stateObject) => {
    debug(`AWS IoT operation status: ${stat} (${clientToken})`)
    handleOperationResult(clientToken, false, stat)
  })

  shadow.on('message', (topic, payload) => {
    if (topic === toDeviceTopic) {
      connector.sendCtrlMessage(JSON.parse(payload))
    } else if (topic === deviceCommandSendTopic) {
      handleDeviceCommandMessage(payload)
    } else if (topic === cloudSendTopic) {
      nodeRedSendClient.connect(toDevicePort, toDeviceHost, () => {
        const key = agent.config.get('COMMUNICATION_KEY')
        const pass = Buffer.from(key.slice(0, 64), 'hex')
        const iv = Buffer.from(key.slice(64, 64 + 32), 'hex')
        const cipher = crypto.createCipheriv('aes-256-cbc', pass, iv)
        const payloadData = 
          cipher.update(payload.toString(), 'utf8', 'hex') + cipher.final('hex')

        nodeRedSendClient.write(payloadData)
        nodeRedSendClient.destroy()
      })
    } else {
      debug('AWS IoT message', topic, payload)
    }
  })

  shadow.on('delta', async (thingName, stateObject) => {
    debug('AWS IoT delta', stateObject)
    handleStateMessageChange(stateObject.state.message)
  })

  nodeRedRecvServer.on('connection', function(socket) {
    socket.on('data', function(message) {
      debug('Node RED Recv Server socket open')
      const str = message.toString()
      try{ 
        const key = agent.config.get('COMMUNICATION_KEY')
        const pass = Buffer.from(key.slice(0, 64), 'hex')
        const iv = Buffer.from(key.slice(64, 64 + 32), 'hex')
        const decipher = crypto.createDecipheriv('aes-256-cbc', pass, iv)
        const payloadData = 
          decipher.update(str, 'hex', 'utf-8') + decipher.final('utf-8')

        let payload = JSON.parse(payloadData)
        if ('host' in payload && 'message' in payload) {
          const sendData = {
            "cloudEEId":payload.host,
            "message":payload.message
          }
          thingShadow.publish(
            deviceSendTopic,
            JSON.stringify(sendData),
            {
              qos: 0
            }
          )
        } else {
          error('Node RED communication data error')
        }
      } catch (err) {
        error(`Node RED communication data error:${err.message}`)
      }
    })
    socket.on('end', function() {
      debug('Node RED Recv Server socket close')
    })
    // Don't forget to catch error, for your own sake.
    socket.on('error', function(err) {
      error(`Node RED Recv Server socket error: ${err}`)
    })
  })

  return shadow
}

function onConnectorRegisterConfig() {
  const AWSIoTConfigName = 'AWSIOT_CONFIG_FILE'
  const CommunicationKey = 'COMMUNICATION_KEY'
  const key = crypto.randomBytes(32)
  const iv = crypto.randomBytes(16)
  const defaultAWSIoTConfigPath = path.resolve(
    process.argv[1],
    '../../config.json'
  )

  agent.config.addItem(
    AWSIoTConfigName,
    defaultAWSIoTConfigPath,
    'AWSIoT config file path',
    true
  )

  agent.config.addItem(
    CommunicationKey,
    key.toString('hex') + iv.toString('hex'),
    'Key to Communication',
    false
  )

  agent.commandLine.addConfigOption(
    AWSIoTConfigName,
    '--aws-iot-config-file <path>'
  )
}

function ensureAbsolutePath(pathToCheck: string, configFilePath: string) {
  return path.isAbsolute(pathToCheck)
    ? pathToCheck
    : path.resolve(path.dirname(configFilePath), pathToCheck)
}

function onConnectorInit() {
  const awsIotConfigFile = agent.config.get('AWSIOT_CONFIG_FILE')
  info('AWS IoT config file: ' + awsIotConfigFile)

  let awsIotConfig
  try {
    awsIotConfig = JSON.parse(fs.readFileSync(awsIotConfigFile, 'utf8'))
    awsIotConfig.caCert = ensureAbsolutePath(
      awsIotConfig.caCert,
      awsIotConfigFile
    )
    awsIotConfig.clientCert = ensureAbsolutePath(
      awsIotConfig.clientCert,
      awsIotConfigFile
    )
    awsIotConfig.privateKey = ensureAbsolutePath(
      awsIotConfig.privateKey,
      awsIotConfigFile
    )
  } catch (err) {
    console.error('Failed to read config file: ' + err.message)
    process.exit(1)
  }

  thingName = awsIotConfig.thingName
  thingShadow = setupThingShadow(awsIotConfig)

  agent.on('connectorRegister', () => {
    connector.updateRegistrationState(true, thingName)
  })

  agent.on('connectorConnect', () => {
    canRegisterThingShadow = true
    updateThingShadowRegisterState()
  })

  agent.on('connectorDisconnect', () => {
    canRegisterThingShadow = false
    updateThingShadowRegisterState()
  })

  agent.on('connectorCtrlMessageSend', msg => {
    thingShadow.publish(
      `enebular/things/${thingName}/msg/from_device`,
      JSON.stringify(msg),
      {
        qos: 1
      }
    )
  })

  connector.updateActiveState(true)
  connector.updateRegistrationState(true, thingName)

  info('Agent started')
}

function startCore(): boolean {
  const startCore = process.argv.filter(arg => arg === '--start-core')
  return startCore.length > 0 ? true : false
}

async function startup() {
  const portBasePath = path.resolve(__dirname, '../')
  if (!startCore()) {
    return runnerStartup(portBasePath)
  }

  connector = new ConnectorService(onConnectorInit, onConnectorRegisterConfig)
  agent = new EnebularAgent({
    portBasePath: portBasePath,
    connector: connector
  })

  return agent.startup()
}

async function shutdown() {
  if (!startCore()) {
    return runnerShutdown()
  }

  shutdownRequested = true
  await agent.shutdownManager()
  if (awsIotConnected) {
    canRegisterThingShadow = false
    updateThingShadowRegisterState()
    await endThingShadow()
  }
  await agent.shutdownMonitor()
}

async function exit() {
  await shutdown()
  process.exit(0)
}

if (require.main === module) {
  process.on('SIGINT', () => {
    exit()
  })
  process.on('SIGTERM', () => {
    exit()
  })

  startup()
    .then(ret => {
      if (!ret) {
        process.exit(1)
      }
    })
    .catch(err => {
      console.error(`Agent startup failed: ${err}`)
      process.exit(1)
    })
}

export { startup, shutdown }
