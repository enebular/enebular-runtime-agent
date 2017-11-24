'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.shutdown = exports.startup = undefined;

var _net = require('net');

var _net2 = _interopRequireDefault(_net);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var path = '/tmp/sock.test';

var server = void 0;

var END_OF_MSG_MARKER = 0x1E; // RS (Record Separator)

var log = (0, _debug2.default)('enebular-local-agent');

function startup() {

  server = _net2.default.createServer(function (socket) {

    log('client connected');

    socket.setEncoding('utf8');

    // todo: check for end of message at 'end' and after each 'data'
    var message = '';

    socket.on('data', function (data) {
      log('client data chunk (' + data.length + ')');
      message += data;
      if (message.charCodeAt(message.length - 1) == END_OF_MSG_MARKER) {
        message = message.slice(0, -1);
        log('client message: [' + message + ']');
        message = '';
      }
    });

    socket.on('end', function () {
      if (message.length > 0) {
        log('client ended with partial message: ' + message);
      } else {
        log('client ended');
      }
    });

    socket.on('close', function () {
      log('client closed');
    });

    socket.on('error', function (err) {
      log('client socket error: ' + err);
    });

    socket.write('ok' + String.fromCharCode(END_OF_MSG_MARKER));
  });

  server.on('listening', function () {
    log('server listening on: ' + server.address());
  });

  server.on('error', function (err) {
    console.error('server error: ' + err);
  });

  server.on('close', function () {
    log('server closed');
  });

  try {
    _fs2.default.unlinkSync(path);
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

exports.startup = startup;
exports.shutdown = shutdown;

// todo: server.close(), unlink handling on signal etc