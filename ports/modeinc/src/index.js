/* @flow */
import path from 'path'
import ModeDevice from 'mode-device'
import { EnebularAgent, MessengerService } from 'enebular-runtime-agent'

const { DEVICE_ID, DEVICE_API_KEY, NODE_RED_DIR } = process.env

const moduleName = 'mode'

function debug(msg, ...args) {
  args.push({ module: moduleName })
  agent.log.debug(msg, ...args)
}

function info(msg, ...args) {
  args.push({ module: moduleName })
  agent.log.info(msg, ...args)
}

const messenger = new MessengerService()
const device = new ModeDevice(DEVICE_ID, DEVICE_API_KEY)
const agent = new EnebularAgent(messenger, {
  nodeRedDir: NODE_RED_DIR || path.join(process.cwd(), 'node-red'),
  configFile: path.join(process.cwd(), '.enebular-config.json')
})

async function startup () {
  try {
    await agent.startup()
    info('Agent started')
    device.commandCallback = (msg, flags) => {
      debug('Mode command: ' + JSON.stringify(msg))
      debug('Message: ' + msg.action)
      messenger.sendMessage(msg.action, msg.parameters)
    }
    device.listenCommands()
    messenger.updateConnectedState(true)
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

async function shutdown () {
  return agent.shutdown()
}

async function exit() {
  await shutdown()
  process.exit(0)
}

if (require.main === module) {
  startup()
  process.on('SIGINT', () => {
    exit()
  });
  process.on('SIGTERM', () => {
    exit()
  });
  process.on('uncaughtException', (err) => {
    console.error(`Uncaught exception: ${err.stack}`)
    process.exit(1)
  });
}

export { startup, shutdown }
