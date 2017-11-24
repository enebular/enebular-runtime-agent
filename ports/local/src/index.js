
import net from 'net';
import fs from 'fs';
import debug from 'debug';

let path = '/tmp/sock.test';
let server;

const END_OF_MSG_MARKER = 0x1E; // RS (Record Separator)

const log = debug('enebular-local-agent');

function startup() {

  server = net.createServer((socket) => {

    log('client connected');

    socket.setEncoding('utf8');

    // todo: check for end of message at 'end' and after each 'data'
    let message = '';

    socket.on('data', (data) => {
      log(`client data chunk (${data.length})`);
      message += data;
      if (message.charCodeAt(message.length-1) == END_OF_MSG_MARKER) {
        message = message.slice(0, -1);
        log(`client message: [${message}]`);
        message = '';
      }
    });

    socket.on('end', () => {
      if (message.length > 0) {
        log('client ended with partial message: ' + message);
      } else {
        log('client ended');
      }
    });

    socket.on('close', () => {
      log('client closed');
    });

    socket.on('error', (err) => {
      log('client socket error: ' + err);
    });

    socket.write('ok' + String.fromCharCode(END_OF_MSG_MARKER));

  });

  server.on('listening', () => {
    log('server listening on: ' + server.address());
  });

  server.on('error', (err) => {
    console.error('server error: ' + err);
  });

  server.on('close', () => {
    log('server closed');
  });

  try {
    fs.unlinkSync(path);
  } catch (err) {
    // ignore any errors
  }
  server.listen(path);
}

function shutdown() {
  //
}

if (require.main === module) {
  startup();
}

export { startup, shutdown };

// todo: server.close(), unlink handling on signal etc
