
import net from 'net';
import fs from 'fs';

let path = '/tmp/sock.test';
let server;

const END_OF_MSG_MARKER = 0x1E; // RS (Record Separator)

function startup() {

  server = net.createServer((socket) => {

    console.log('client connected');

    socket.setEncoding('utf8');

    // todo: check for end of message at 'end' and after each 'data'
    let message = '';

    socket.on('data', (data) => {
      console.log(`client data chunk (${data.length})`);
      message += data;
      if (message.charCodeAt(message.length-1) == END_OF_MSG_MARKER) {
        message = message.slice(0, -1);
        console.log(`client message: [${message}]`);
        message = '';
      }
    });

    socket.on('end', () => {
      if (message.length > 0) {
        console.log('client ended with partial message: ' + message);
      } else {
        console.log('client ended');
      }
    });

    socket.on('close', () => {
      console.log('client closed');
    });

    socket.on('error', (err) => {
      console.log('client socket error: ' + err);
    });

    socket.write('ok' + String.fromCharCode(END_OF_MSG_MARKER));

  });

  server.on('listening', () => {
    console.log('server listening on: ' + server.address());
  });

  server.on('error', (err) => {
    console.error('server error: ' + err);
  });

  server.on('close', () => {
    console.log('server closed');
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
