/* @flow */
import net from 'net';
import fs from 'fs';
import path from 'path';
import { EnebularAgent, MessengerService } from 'enebular-runtime-agent';
import debug from 'debug';

const log = debug('enebular-local-agent');

const END_OF_MSG_MARKER = 0x1E; // RS (Record Separator)

let socketPath = '/tmp/enebular-local-agent.socket';
let server: net.Server;

async function startServer(messenger: MessengerService) {

  function handleClientMessage(clientMessage: string) {
    try {
      const { messageType, message } = JSON.parse(clientMessage);
      //log('messageType: ' + messageType);
      //log('message: ' + JSON.stringify(message));
      messenger.sendMessage(messageType, message);
    } catch (err) {
      log('client message: JSON parse failed: ' + err);
    }
  }

  server = net.createServer((socket) => {

    log('client connected');

    //todo: we really need the client to tell us when mbed is really online
    messenger.updateConnectedState(true);

    socket.setEncoding('utf8');

    // todo: check for end of message at 'end' and after each 'data'
    let message = '';

    socket.on('data', (data) => {
      //log(`client data chunk (${data.length})`);
      message += data;
      if (message.charCodeAt(message.length-1) == END_OF_MSG_MARKER) {
        message = message.slice(0, -1);
        log(`client message: [${message}]`);
        handleClientMessage(message);
        message = '';
      }
    });

    socket.on('end', () => {
      if (message.length > 0) {
        log('client ended with partial message: ' + message);
      } else {
        //log('client ended');
      }
    });

    socket.on('close', () => {
      log('client disconnected');
      messenger.updateConnectedState(false);
    });

    socket.on('error', (err) => {
      log('client socket error: ' + err);
    });

    socket.write('ok' + String.fromCharCode(END_OF_MSG_MARKER));

  });

  server.on('listening', () => {
    log('server listening on: ' + JSON.stringify(server.address()));
  });

  server.on('error', (err) => {
    console.error('server error: ' + err);
  });

  server.on('close', () => {
    log('server closed');
  });

  try {
    fs.unlinkSync(socketPath);
  } catch (err) {
    // ignore any errors
  }
  server.listen(socketPath);
}

let agent: EnebularAgent;
let messenger: MessengerService;

async function startup() {

  messenger = new MessengerService();

  agent = new EnebularAgent(messenger, {
    nodeRedDir: process.env.NODE_RED_DIR || path.join(process.cwd(), 'node-red'),
    configFile: path.join(process.cwd(), '.enebular-config.json'),
  });

  await agent.startup();
  log('agent started');

  await startServer(messenger);
}

function shutdown() {
  //
}

if (require.main === module) {
  startup();
}

export { startup, shutdown };

// todo: server.close(), unlink handling on signal etc
