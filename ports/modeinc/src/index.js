/* @flow */
import path from 'path'
import ModeDevice from 'mode-device'
import EnebularAgent from 'enebular-runtime-agent'

const { DEVICE_ID, DEVICE_API_KEY, NODE_RED_DIR } = process.env

const device = new ModeDevice(DEVICE_ID, DEVICE_API_KEY)
const agent = new EnebularAgent({
  nodeRedDir: NODE_RED_DIR || path.join(process.cwd(), 'node-red'),
  configFile: path.join(process.cwd(), '.enebular-config.json')
})

async function startup () {
  try {
    device.commandCallback = (msg, flags) => {
      agent.handleDeviceMasterMessage(msg.action, msg.parameters)
    }
    device.listenCommands()
    await agent.startup()
    console.log('### mode enebular agent started up ####')
    return agent
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
    console.error(`Uncaught exception: ${err}`);
    exit()
  });
}

export { startup, shutdown }
