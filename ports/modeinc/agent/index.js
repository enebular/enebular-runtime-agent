/* @flow */
import ModeDevice from 'mode-device';
import EnebularAgent from '@uhuru/enebular-runtime-agent';

const { DEVICE_ID, DEVICE_API_KEY } = process.env;

const device = new ModeDevice(DEVICE_ID, DEVICE_API_KEY);
const agent = new EnebularAgent({
  nodeRedDir: '../../../node-red',
  configFile: './.enebular-config.json',
});

async function startup() {
  device.commandCallback = (msg, flags) => {
    console.log(msg, flags);
    agent.handleDeviceMasterMessage(msg.action, msg.parameters);
  };
  device.listenCommands();
  await agent.start();
  console.log('agent started up');
}

if (require.main === module) {
  startup();
}
