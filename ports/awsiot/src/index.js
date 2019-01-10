/* @flow */
import fs from 'fs'
import path from 'path'
import awsIot from 'aws-iot-device-sdk'
import { version as agentVer } from 'enebular-runtime-agent/package.json'
import { EnebularAgent, ConnectorService } from 'enebular-runtime-agent'

const MODULE_NAME = 'aws-iot'

let agent: EnebularAgent
let connector: ConnectorService
let thingName: string
let thingShadow: awsIot.thingShadow
let canRegisterThingShadow: boolean = false
let thingShadowRegistered: boolean = false
let awsIotConnected: boolean = false
let operationResultHandlers = {}

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

async function updateThingShadow(state) {
  return new Promise((resolve, reject) => {
    let token = thingShadow.update(thingName, state)
    if (token === null) {
      error('Shadow update request failed')
      resolve()
    } else {
      debug(`Shadow update requested (${token})`)
      operationResultHandlers[token] = (timeout, stat) => {
        if (timeout || stat !== 'accepted') {
          error('Shadow update failed')
        }
        resolve()
      }
    }
  })
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
  return updateThingShadow(
    createThingShadowReportedAwsIotConnectedState(connected)
  )
}

async function updateThingShadowReportedAgentInfo() {
  const info = {
    type: 'enebular-agent',
    v: agentVer
  }
  return updateThingShadow(createThingShadowReportedAgentInfo(info))
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

  shadow.on('connect', () => {
    info('Connected to AWS IoT')
    let thingShadowAlreadyRegistered = thingShadowRegistered

    awsIotConnected = true
    updateThingShadowRegisterState()

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
      let token = thingShadow.get(thingName)
      operationResultHandlers[token] = (timeout, stat) => {
        if (!timeout && stat === 'accepted') {
          updateThingShadowReportedAwsIotConnectedState(true)
        } else {
          error('Failed to get latest shadow version')
        }
      }
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
    debug('AWS IoT message', topic, payload)
  })

  shadow.on('delta', async (thingName, stateObject) => {
    debug('AWS IoT delta', stateObject)
    handleStateMessageChange(stateObject.state.message)
  })

  return shadow
}

function onConnectorRegisterConfig() {
  const AWSIoTConfigName = 'AWSIOT_CONFIG_FILE'
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
    console.error(err)
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

  connector.updateActiveState(true)
  connector.updateRegistrationState(true, thingName)

  info('Agent started')
}

async function startup() {
  connector = new ConnectorService(onConnectorInit, onConnectorRegisterConfig)
  agent = new EnebularAgent({
    portBasePath: path.resolve(__dirname, '../'),
    connector: connector
  })

  return agent.startup()
}

async function shutdown() {
  await agent.shutdown()
  if (awsIotConnected) {
    canRegisterThingShadow = false
    updateThingShadowRegisterState()
    await endThingShadow()
  }
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

  startup().then((ret) => {
    if (!ret) {
      process.exit(1)
    }
  })
}

export { startup, shutdown }
