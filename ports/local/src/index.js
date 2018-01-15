/* @flow */
import net from 'net';
import fs from 'fs';
import path from 'path';
import { EnebularAgent, MessengerService } from 'enebular-runtime-agent';

const moduleName = 'local'

let agent: EnebularAgent;
let messenger: MessengerService;

function log(level: string, msg: string, ...args: Array<mixed>) {
  args.push({ module: moduleName })
  agent.log.log(level, msg, ...args)
}

function debug(msg: string, ...args: Array<mixed>) {
  log('debug', msg, ...args)
}

function info(msg: string, ...args: Array<mixed>) {
  log('info', msg, ...args)
}

function error(msg: string, ...args: Array<mixed>) {
  log('error', msg, ...args)
}

const END_OF_MSG_MARKER = 0x1E; // RS (Record Separator)

let socketPath = '/tmp/enebular-local-agent.socket';
let server: net.Server;

async function startServer(messenger: MessengerService) {

  function handleClientMessage(clientMessage: string) {
    try {
      const { messageType, message } = JSON.parse(clientMessage);
      //debug('messageType: ' + messageType);
      //debug('message: ' + JSON.stringify(message));
      messenger.sendMessage(messageType, message);
    } catch (err) {
      error('client message: JSON parse failed: ' + err);
    }
  }

  server = net.createServer((socket) => {

    info('client connected');

    //todo: we really need the client to tell us when mbed is really online
    messenger.updateConnectedState(true);

    socket.setEncoding('utf8');

    // todo: check for end of message at 'end' and after each 'data'
    let message = '';

    socket.on('data', (data) => {
      //debug(`client data chunk (${data.length})`);
      message += data;
      if (message.charCodeAt(message.length-1) == END_OF_MSG_MARKER) {
        message = message.slice(0, -1);
        debug(`client message: [${message}]`);
        handleClientMessage(message);
        message = '';
      }
    });

    socket.on('end', () => {
      if (message.length > 0) {
        info('client ended with partial message: ' + message);
      } else {
        //debug('client ended');
      }
    });

    socket.on('close', () => {
      info('client disconnected');
      messenger.updateConnectedState(false);
    });

    socket.on('error', (err) => {
      info('client socket error: ' + err);
    });

    socket.write('ok' + String.fromCharCode(END_OF_MSG_MARKER));

  });

  server.on('listening', () => {
    info('server listening on: ' + JSON.stringify(server.address()));
  });

  server.on('error', (err) => {
    console.error('server error: ' + err);
  });

  server.on('close', () => {
    info('server closed');
  });

  try {
    fs.unlinkSync(socketPath);
  } catch (err) {
    // ignore any errors
  }
  server.listen(socketPath);
}

async function startup() {

  messenger = new MessengerService();

  agent = new EnebularAgent(messenger, {
    nodeRedDir: process.env.NODE_RED_DIR || path.join(process.cwd(), 'node-red'),
    configFile: path.join(process.cwd(), '.enebular-config.json'),
  });

  await agent.startup();
  info('agent started');

  await startServer(messenger);
}

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

// todo: server.close(), unlink handling on signal etc
