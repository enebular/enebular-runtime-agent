/* @flow */
import fs from 'fs';
import path from 'path';
import EventEmitter from 'events';
import awsIot from 'aws-iot-device-sdk';
import debug from 'debug';
import { EnebularAgent, MessengerService } from 'enebular-runtime-agent';


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

function setupDevice(config: AWSIoTConfig, messenger: MessengerService) {
  const device = awsIot.thingShadow(config);

  function handleConnectionStateUpdate(connected: bool) {
    if (!connected) {
      log('ignoring disconnect');
      return;
    }
    messenger.updateConnectedState(connected);
  }

  device.on('connect', async () => {
    log('>> connected to AWS IoT');
    device.register(config.thingName, { ignoreDeltas: false, persistentSubscribe: true });
    setTimeout(() => device.get(config.thingName), 2000);
    handleConnectionStateUpdate(true);
  });

  device.on('offline', () => {
    log('>> offline : no AWS IoT connection established');
    handleConnectionStateUpdate(false);
  });

  device.on('close', () => {
    log('>> AWS IoT connection closed');
    device.unregister(config.thingName);
    handleConnectionStateUpdate(false);
  });

  device.on('reconnect', () => {
    log('>> reconnect to AWS IoT');
    device.register(config.thingName);
  });

  device.on('error', (error) => {
    log('## error', error);
  });

  device.on('message', (topic, payload) => {
    log('>> message', topic, payload);
  });

  function handleStateChange(messageJSON: string) {
    try {
      const { messageType, message } = JSON.parse(messageJSON);
      messenger.sendMessage(messageType, message);
    } catch (err) {
      log('!!! Error parsing message property in status. Invalid JSON format !!!');
    }
    const newState = { message: messageJSON };
    device.update(config.thingName, { state: { reported: newState } });
  }

  device.once('status', async (thingName, stat, clientToken, stateObject) => {
    log('>> status', stateObject);
    const state = stateObject.state;
    const metadata = stateObject.metadata;
    if (state && state.desired && state.desired.message && !isThingShadowSynced(metadata, 'message')) {
      handleStateChange(state.desired.message);
    }
  });

  device.on('delta', async (thingName, stateObject) => {
    log('>> delta', stateObject);
    const state = stateObject.state;
    const metadata = stateObject.metadata;
    if (state && state.message && !isThingShadowSynced(metadata, 'message')) {
      handleStateChange(state.message);
    }
  });
}

let agent: EnebularAgent;
let messenger: MessengerService;

/**
 *
 */
async function startup() {
  try {
    messenger = new MessengerService();

    agent = new EnebularAgent(messenger, {
      nodeRedDir: NODE_RED_DIR || path.join(process.cwd(), 'node-red'),
      configFile: path.join(process.cwd(), '.enebular-config.json'),
    });

    await agent.startup();
    log('### enebular agent started up ####');

    const awsIoTConfigFile = AWSIOT_CONFIG_FILE || path.join(process.cwd(), './config.json');
    log('AWS IoT config file =', awsIoTConfigFile);
    const awsIotConfig = JSON.parse(fs.readFileSync(awsIoTConfigFile, 'utf8'));
    setupDevice(awsIotConfig, messenger);

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
