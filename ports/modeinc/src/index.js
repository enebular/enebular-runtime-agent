/* @flow */
import path from 'path';
import ModeDevice from 'mode-device';
import { EnebularAgent, MessengerService } from 'enebular-runtime-agent';

const { DEVICE_ID, DEVICE_API_KEY, NODE_RED_DIR } = process.env;

const messenger = new MessengerService();
const device = new ModeDevice(DEVICE_ID, DEVICE_API_KEY);
const agent = new EnebularAgent(messenger, {
  nodeRedDir: NODE_RED_DIR || path.join(process.cwd(), 'node-red'),
  configFile: path.join(process.cwd(), '.enebular-config.json'),
});

async function startup() {
  try {
    device.commandCallback = (msg, flags) => {
      console.log(msg, flags);
      messenger.sendMessage(msg.action, msg.parameters);
    };
    device.listenCommands();
    await agent.startup();
    console.log('### enebular agent started up ####');
    messenger.updateConnectedState(true);
    return agent;
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

async function shutdown() {
  return agent.shutdown();
}

if (require.main === module) {
  startup();
}

export { startup, shutdown };
