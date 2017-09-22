/* @flow */
import fs from 'fs';
import path from 'path';
import awsIot from 'aws-iot-device-sdk';
import debug from 'debug';
import EnebularAgent from 'enebular-runtime-agent';


/**
 *
 */
const log = debug('enebular-awsiot-agent');

const { AWSIOT_CONFIG_FILE, NODE_RED_DIR } = process.env;

/**
 *
 */
function isThingShadowSynced(metadata, property) {
  const desiredTimestamp = (metadata.desired && metadata.desired[property] || {}).timestamp;
  const reportedTimestamp = (metadata.reported && metadata.reported[property] || {}).timestamp;
  return reportedTimestamp >= desiredTimestamp;
}

/**
 *
 */
export type AWSIoTConfig = {
  thingName: string,
};

function setupDevice(config: AWSIoTConfig, agent: EnebularAgent) {
  const device = awsIot.thingShadow(config);

  device.on('connect', async () => {
    log('>> connected to AWS IoT');
    device.register(config.thingName, { ignoreDeltas: false, persistentSubscribe: true });
    setTimeout(() => device.get(config.thingName), 2000);
  });

  device.on('close', () => {
    log('>> AWS IoT connection closed');
    device.unregister(config.thingName);
  });

  device.on('reconnect', () => {
    log('>> reconnect to AWS IoT');
    device.register(config.thingName);
  });

  device.on('error', (error) => {
    log('## error', error);
  });

  device.on('offline', () => {
    log('>> offline : no AWS IoT connection established');
  });

  device.on('message', (topic, payload) => {
    log('>> message', topic, payload);
  });

  device.once('status', async (thingName, stat, clientToken, stateObject) => {
    log('>> status', stateObject);
    const state = stateObject.state;
    const metadata = stateObject.metadata;
    if (state.desired.message && !isThingShadowSynced(metadata, 'message')) {
      const { messageType, message } = state.desired.message;
      agent.handleDeviceMasterMessage(messageType, message);
      const newState = { message: state.desired.message };
      device.update(thingName, { state: { reported: newState } });
    }
  });

  device.on('delta', async (thingName, stateObject) => {
    log('>> delta', stateObject);
    const state = stateObject.state;
    const metadata = stateObject.metadata;
    if (state.message && !isThingShadowSynced(metadata, 'message')) {
      const { messageType, message } = state.message;
      agent.handleDeviceMasterMessage(messageType, message);
      const newState = { message: state.message };
      device.update(thingName, { state: { reported: newState } });
    }
  });
}


let agent: EnebularAgent;

/**
 *
 */
async function startup() {
  try {
    agent = new EnebularAgent({
      nodeRedDir: NODE_RED_DIR || path.join(process.cwd(), 'node-red'),
      configFile: path.join(process.cwd(), '.enebular-config.json'),
    });

    const awsIoTConfigFile = AWSIOT_CONFIG_FILE || path.join(process.cwd(), './config.json');
    log('AWS IoT config file =', awsIoTConfigFile);
    const awsIotConfig = JSON.parse(fs.readFileSync(awsIoTConfigFile, 'utf8'));
    setupDevice(awsIotConfig, agent);

    await agent.startup();
    log('### enebular agent started up ####');
    return agent;

  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

/**
 *
 */
async function shutdown() {
  return agent.shutdown();
}

if (require.main === module) {
  startup();
}

export { startup, shutdown };
