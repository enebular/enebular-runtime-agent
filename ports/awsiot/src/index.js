/* @flow */
import fs from 'fs';
import path from 'path';
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
export type AWSIoTConfig = {
  thingName: string,
};

function setupDevice(config: AWSIoTConfig, messenger: MessengerService) {
  const device = awsIot.thingShadow(config);

  function handleConnectionStateUpdate(connected: boolean) {
    if (!connected) {
      log('ignoring disconnect');
      return;
    }
    messenger.updateConnectedState(connected);
  }

  device.on('connect', async () => {
    log('>> connected to AWS IoT');
    device.register(config.thingName, { ignoreDeltas: false, persistentSubscribe: true });
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

  device.on('timeout', async (thingName, clientToken) => {
    log(`timeout (${clientToken})`);
  });

  device.on('status', async (thingName, stat, clientToken, stateObject) => {
    log(`status: ${stat} (${clientToken})`);
  });

  device.on('message', (topic, payload) => {
    log('>> message', topic, payload);
  });

  function handleStateMessageChange(messageJSON: string) {
    try {
      const { messageType, message } = JSON.parse(messageJSON);
      messenger.sendMessage(messageType, message);
    } catch (err) {
      log('!!! Error parsing message property in status. Invalid JSON format !!!');
    }
    const newState = { message: messageJSON };
    let clientToken = device.update(config.thingName, { state: { reported: newState } });
    if (clientToken === null) {
      log('shadow update failed');
    } else {
      log(`shadow update requested (${clientToken})`);
    }
  }

  device.on('delta', async (thingName, stateObject) => {
    log('>> delta', stateObject);
    handleStateMessageChange(stateObject.state.message);
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

async function exit() {
  await shutdown();
  process.exit(0);
}

if (require.main === module) {
  startup();
  process.on('SIGINT', () => {
    exit();
  });
  process.on('SIGTERM', () => {
    exit();
  });
  process.on('uncaughtException', (err) => {
    console.error(`Uncaught exception: ${err.stack}`);
    process.exit(1);
  });
}

export { startup, shutdown };
