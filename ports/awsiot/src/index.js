import fs from 'fs';
import awsIot from 'aws-iot-device-sdk';
import fetch from 'isomorphic-fetch';
import EnebularAgent from 'enebular-runtime-agent';

const agent = new EnebularAgent({
  command: 'npm',
  args: ['run', 'start' ],
  pkgDir: process.env.NODE_RED_DIR,
});

let device;

async function fetchAndUpdateFlow(params) {
  console.log('fetchAndUpdateFlow', params);
  await agent.downloadAndUpdatePackage(params.downloadUrl);
  await agent.restartService();
}

function updateThingState(thingName, state) {
  device.update(thingName, { state: { reported: state } });
}

function setupDevice(config) {
  const device = awsIot.thingShadow(config);

  device.on('connect', async () => {
    console.log('>> connected to AWS IoT');
    device.register(config.thingName, { ignoreDeltas: false, persistentSubscribe: true });
    setTimeout(() => device.get(config.thingName), 2000);
    await agent.restartService();
  });

  device.on('close', () => {
    console.log('>> AWS IoT connection closed');
    device.unregister(config.thingName);
  });

  device.on('reconnect', () => {
    console.log('>> reconnect to AWS IoT');
    device.register(config.thingName);
  });

  device.on('error', (error) => {
    console.log('## error', error);
  });

  device.on('offline', () => {
    console.log('>> offline : no AWS IoT connection established');
  });

  device.once('status', async (thingName, stat, clientToken, stateObject) => {
    var state = stateObject.state;
    var metadata = stateObject.metadata;
    if (state.desired.package) {
      await fetchAndUpdateFlow(state.desired.package);
      updateThingState(config.thingName, { package: state.desired.package });
    }
  });

  device.on('delta', async (thingName, stateObject) => {
    var state = stateObject.state;
    var metadata = stateObject.metadata;
    if (state.package) {
      await fetchAndUpdateFlow(state.package);
      updateThingState(config.thingName, { package: state.package });
    }
  });

  return device;
}

export function startup() {
  console.log(process.argv);
  const configFile = process.env.AWSIOT_CONFIG_FILE || process.argv[2] || './config.json';
  console.log('configFile=', configFile);
  const config = JSON.parse(fs.readFileSync(configFile));
  console.log('awsiot config=>', config);
  device = setupDevice(config);
  console.log('agent started up');
}

if (require.main === module) {
  startup();
}
