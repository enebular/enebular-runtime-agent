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
const logv = debug('enebular-awsiot-agent:verbose');
let _log;

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
      log('Ignoring disconnect');
      return;
    }
    messenger.updateConnectedState(connected);
  }

  device.on('connect', async () => {
    log('Connected to AWS IoT');
    device.register(config.thingName, { ignoreDeltas: false, persistentSubscribe: true });
    handleConnectionStateUpdate(true);
  });

  device.on('offline', () => {
    log('AWS IoT connection offline');
    handleConnectionStateUpdate(false);
  });

  device.on('close', () => {
    log('AWS IoT connection closed');
    device.unregister(config.thingName);
    handleConnectionStateUpdate(false);
  });

  device.on('reconnect', () => {
    log('Reconnecting to AWS IoT');
    device.register(config.thingName);
  });

  device.on('error', (error) => {
    log('AWS IoT connection error: ' + error);
  });

  device.on('timeout', async (thingName, clientToken) => {
    log(`AWS IoT timeout (${clientToken})`);
  });

  device.on('status', async (thingName, stat, clientToken, stateObject) => {
    log(`AWS IoT status: ${stat} (${clientToken})`);
  });

  device.on('message', (topic, payload) => {
    log('AWS IoT message', topic, payload);
  });

  function handleStateMessageChange(messageJSON: string) {
    try {
      const { messageType, message } = JSON.parse(messageJSON);
      log('Message: ' + messageType);
      messenger.sendMessage(messageType, message);
    } catch (err) {
      log('Message parse failed. ' + err);
    }
    const newState = { message: messageJSON };
    let clientToken = device.update(config.thingName, { state: { reported: newState } });
    if (clientToken === null) {
      log('Shadow update failed');
    } else {
      log(`Shadow update requested (${clientToken})`);
    }
  }

  device.on('delta', async (thingName, stateObject) => {
    logv('AWS IoT delta', stateObject);
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
    const awsIoTConfigFile = AWSIOT_CONFIG_FILE || path.join(process.cwd(), './config.json');
    log('AWS IoT config file: ' + awsIoTConfigFile);
    const awsIotConfig = JSON.parse(fs.readFileSync(awsIoTConfigFile, 'utf8'));

    messenger = new MessengerService();
    agent = new EnebularAgent(messenger, {
      nodeRedDir: NODE_RED_DIR || path.join(process.cwd(), 'node-red'),
      configFile: path.join(process.cwd(), '.enebular-config.json'),
    });

    await agent.startup();
    _log = agent.log;
    _log.info('Agent started');

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
