/* @flow */
import fs from 'fs'
import awsIot from 'aws-iot-device-sdk'
import { EnebularAgent, ConnectorService } from 'enebular-runtime-agent'

const MODULE_NAME = 'aws-iot'

const {
  ENEBULAR_CONFIG_PATH,
  NODE_RED_DIR,
  NODE_RED_DATA_DIR,
  NODE_RED_COMMAND,
  AWSIOT_CONFIG_FILE
} = process.env

let agent: EnebularAgent
let connector: ConnectorService
let thingName: string
let thingShadow: awsIot.thingShadow
let canRegisterThingShadow: boolean = false
let thingShadowRegistered: boolean = false
let awsIotConnected: boolean = false

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

async function endThingShadow() {
  return new Promise((resolve, reject) => {
    thingShadow.end(false, () => {
      resolve()
    })
  })
}

function updateThingShadow(state) {
  let clientToken = thingShadow.update(thingName, {
    state: state
  })
  if (clientToken === null) {
    error('Shadow update failed')
  } else {
    debug(`Shadow update requested (${clientToken})`)
  }
}

function updateThingShadowConnectedState(connected: boolean) {
  updateThingShadow({ reported: { connected: connected } })
}

function handleThingShadowRegisterStateChange(registered: boolean) {
  if (registered === thingShadowRegistered) {
    return
  }
  thingShadowRegistered = registered
  info('Thing shadow ' + (registered ? 'registered' : 'unregistered'))
  connector.updateConnectionState(registered)
}

function updateThingShadowRegisterState() {
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
      err => {
        if (!err) {
          updateThingShadowConnectedState(true)
        }
        handleThingShadowRegisterStateChange(!err)
      }
    )
  } else {
    updateThingShadowConnectedState(false)
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
  const newState = { message: messageJSON }
  updateThingShadow({ reported: newState })
}

function setupThingShadow(config: AWSIoTConfig) {
  config['will'] = {
    topic: `enebular/things/${config.thingName}/shadow/update`,
    payload:  '{ "state" : { "reported" : { "connected" : "false" }}}'
  }
  const shadow = awsIot.thingShadow(config)

  shadow.on('connect', () => {
    info('Connected to AWS IoT')
    awsIotConnected = true
    updateThingShadowRegisterState()
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
    debug(`AWS IoT timeout (${clientToken})`)
  })

  shadow.on('status', async (thingName, stat, clientToken, stateObject) => {
    debug(`AWS IoT status: ${stat} (${clientToken})`)
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

async function startup() {
  const configFile = ENEBULAR_CONFIG_PATH || '.enebular-config.json'
  const nodeRedDir = NODE_RED_DIR || 'node-red'
  const awsIoTConfigFile = AWSIOT_CONFIG_FILE || './config.json'

  console.log('AWS IoT config file: ' + awsIoTConfigFile)

  let awsIotConfig
  try {
    awsIotConfig = JSON.parse(fs.readFileSync(awsIoTConfigFile, 'utf8'))
  } catch (err) {
    console.error(err)
    process.exit(1)
  }

  thingName = awsIotConfig.thingName
  connector = new ConnectorService()
  let agentConfig = {
    nodeRedDir: nodeRedDir,
    configFile: configFile
  }
  if (NODE_RED_DATA_DIR) {
    agentConfig['nodeRedDataDir'] = NODE_RED_DATA_DIR
  }
  if (NODE_RED_COMMAND) {
    agentConfig['nodeRedCommand'] = NODE_RED_COMMAND
  }
  agent = new EnebularAgent(connector, agentConfig)

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

  await agent.startup()
  info('Agent started')

  connector.updateActiveState(true)
  connector.updateRegistrationState(true, thingName)
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
  startup()
  process.on('SIGINT', () => {
    exit()
  })
  process.on('SIGTERM', () => {
    exit()
  })
  process.on('uncaughtException', err => {
    console.error(`Uncaught exception: ${err.stack}`)
    process.exit(1)
  })
}

export { startup, shutdown }
