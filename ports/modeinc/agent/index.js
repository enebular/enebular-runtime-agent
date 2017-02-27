import ModeDevice from 'mode-device';
import EnebularAgent from 'enebular-runtime-agent';

const { DEVICE_ID, DEVICE_API_KEY } = process.env;

const device = new ModeDevice(DEVICE_ID, DEVICE_API_KEY);
const agent = new EnebularAgent({
  command: 'npm',
  args: ['run', 'start' ],
  pkgDir: '../../../node-red',
});

async function fetchAndUpdateFlow(params) {
  await agent.downloadAndUpdatePackage(params.downloadUrl);
  await agent.restartService();
}

async function startup() {
  device.commandCallback = (msg, flags) => {
    console.log(msg, flags);
    switch(msg.action) {
      case 'update-flow':
        fetchAndUpdateFlow(msg.parameters);
        break;
      case 'restart':
        agent.restartService();
        break;
      case 'shutdown':
        agent.shutdownService();
        break;
      default:
        break;
    }
  };
  device.listenCommands();
  const ret = await agent.startService();
  console.log('agent started up');
}

if (require.main === module) {
  startup();
}
