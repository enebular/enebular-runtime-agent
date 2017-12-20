/* @flow */
import fs from 'fs';
import path from 'path';
import awsIot from 'aws-iot-device-sdk';
import { EnebularAgent, MessengerService } from 'enebular-runtime-agent';

let _log;

const moduleName = 'aws-iot';

function debug(msg, ...args) {
  args.push({ module: moduleName })
  _log.debug(msg, ...args);
}

function info(msg, ...args) {
  args.push({ module: moduleName })
  _log.info(msg, ...args);
}

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
      debug('Ignoring disconnect');
      return;
    }
    messenger.updateConnectedState(connected);
  }

  device.on('connect', async () => {
    info('Connected to AWS IoT');
    device.register(config.thingName, { ignoreDeltas: false, persistentSubscribe: true });
    handleConnectionStateUpdate(true);
  });

  device.on('offline', () => {
    debug('AWS IoT connection offline');
    handleConnectionStateUpdate(false);
  });

  device.on('close', () => {
    debug('AWS IoT connection closed');
    device.unregister(config.thingName);
    handleConnectionStateUpdate(false);
  });

  device.on('reconnect', () => {
    debug('Reconnecting to AWS IoT');
    device.register(config.thingName);
  });

  device.on('error', (error) => {
    debug('AWS IoT connection error: ' + error);
  });

  device.on('timeout', async (thingName, clientToken) => {
    debug(`AWS IoT timeout (${clientToken})`);
  });

  device.on('status', async (thingName, stat, clientToken, stateObject) => {
    debug(`AWS IoT status: ${stat} (${clientToken})`);
  });

  device.on('message', (topic, payload) => {
    debug('AWS IoT message', topic, payload);
  });

  function handleStateMessageChange(messageJSON: string) {
    try {
      const { messageType, message } = JSON.parse(messageJSON);
      debug('Message: ' + messageType);
      messenger.sendMessage(messageType, message);
    } catch (err) {
      _log.error('Message parse failed. ' + err);
    }
    const newState = { message: messageJSON };
    let clientToken = device.update(config.thingName, { state: { reported: newState } });
    if (clientToken === null) {
      _log.error('Shadow update failed');
    } else {
      debug(`Shadow update requested (${clientToken})`);
    }
  }

  device.on('delta', async (thingName, stateObject) => {
    debug('AWS IoT delta', stateObject);
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
    console.log('AWS IoT config file: ' + awsIoTConfigFile);
    const awsIotConfig = JSON.parse(fs.readFileSync(awsIoTConfigFile, 'utf8'));

    messenger = new MessengerService();
    agent = new EnebularAgent(messenger, {
      nodeRedDir: NODE_RED_DIR || path.join(process.cwd(), 'node-red'),
      configFile: path.join(process.cwd(), '.enebular-config.json'),
    });

    await agent.startup();
    _log = agent.log;
    info('Agent started');

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
  console.log('Exiting...');
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
