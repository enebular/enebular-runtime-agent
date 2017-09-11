/* @flow */
import path from 'path';
import ModeDevice from 'mode-device';
import EnebularAgent from '@uhuru/enebular-runtime-agent';

const { DEVICE_ID, DEVICE_API_KEY, NODE_RED_DIR } = process.env;

const device = new ModeDevice(DEVICE_ID, DEVICE_API_KEY);
const agent = new EnebularAgent({
  nodeRedDir: NODE_RED_DIR || path.join(process.cwd(), 'node-red'),
  configFile: path.join(process.cwd(), '.enebular-config.json'),
});

async function startup() {
  try {
    device.commandCallback = (msg, flags) => {
      console.log(msg, flags);
      agent.handleDeviceMasterMessage(msg.action, msg.parameters);
    };
    device.listenCommands();
    await agent.start();
    console.log('agent started up');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

if (require.main === module) {
  startup();
}
