'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.shutdown = exports.startup = undefined;

var _regenerator = require('babel-runtime/regenerator');

var _regenerator2 = _interopRequireDefault(_regenerator);

var _stringify = require('babel-runtime/core-js/json/stringify');

var _stringify2 = _interopRequireDefault(_stringify);

var _asyncToGenerator2 = require('babel-runtime/helpers/asyncToGenerator');

var _asyncToGenerator3 = _interopRequireDefault(_asyncToGenerator2);

var startServer = function () {
  var _ref = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee(agent) {
    var handleClientMessage;
    return _regenerator2.default.wrap(function _callee$(_context) {
      while (1) {
        switch (_context.prev = _context.next) {
          case 0:
            handleClientMessage = function handleClientMessage(clientMessage) {
              try {
                var _JSON$parse = JSON.parse(clientMessage),
                    messageType = _JSON$parse.messageType,
                    message = _JSON$parse.message;
                //log('messageType: ' + messageType);
                //log('message: ' + JSON.stringify(message));


                agent.handleDeviceMasterMessage(messageType, message);
              } catch (err) {
                log('client message: JSON parse failed: ' + err);
              }
            };

            server = _net2.default.createServer(function (socket) {

              log('client connected');

              socket.setEncoding('utf8');

              // todo: check for end of message at 'end' and after each 'data'
              var message = '';

              socket.on('data', function (data) {
                //log(`client data chunk (${data.length})`);
                message += data;
                if (message.charCodeAt(message.length - 1) == END_OF_MSG_MARKER) {
                  message = message.slice(0, -1);
                  log('client message: [' + message + ']');
                  handleClientMessage(message);
                  message = '';
                }
              });

              socket.on('end', function () {
                if (message.length > 0) {
                  log('client ended with partial message: ' + message);
                } else {
                  //log('client ended');
                }
              });

              socket.on('close', function () {
                log('client disconnected');
              });

              socket.on('error', function (err) {
                log('client socket error: ' + err);
              });

              socket.write('ok' + String.fromCharCode(END_OF_MSG_MARKER));
            });

            server.on('listening', function () {
              log('server listening on: ' + (0, _stringify2.default)(server.address()));
            });

            server.on('error', function (err) {
              console.error('server error: ' + err);
            });

            server.on('close', function () {
              log('server closed');
            });

            try {
              _fs2.default.unlinkSync(socketPath);
            } catch (err) {
              // ignore any errors
            }
            server.listen(socketPath);

          case 7:
          case 'end':
            return _context.stop();
        }
      }
    }, _callee, this);
  }));

  return function startServer(_x) {
    return _ref.apply(this, arguments);
  };
}();

var startup = function () {
  var _ref2 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee2() {
    return _regenerator2.default.wrap(function _callee2$(_context2) {
      while (1) {
        switch (_context2.prev = _context2.next) {
          case 0:

            agent = new _enebularRuntimeAgent2.default({
              nodeRedDir: process.env.NODE_RED_DIR || _path2.default.join(process.cwd(), 'node-red'),
              configFile: _path2.default.join(process.cwd(), '.enebular-config.json')
            });

            _context2.next = 3;
            return agent.startup();

          case 3:
            log('agent started');

            _context2.next = 6;
            return startServer(agent);

          case 6:
          case 'end':
            return _context2.stop();
        }
      }
    }, _callee2, this);
  }));

  return function startup() {
    return _ref2.apply(this, arguments);
  };
}();

var _net = require('net');

var _net2 = _interopRequireDefault(_net);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _enebularRuntimeAgent = require('enebular-runtime-agent');

var _enebularRuntimeAgent2 = _interopRequireDefault(_enebularRuntimeAgent);

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var log = (0, _debug2.default)('enebular-local-agent');


var END_OF_MSG_MARKER = 0x1E; // RS (Record Separator)

var socketPath = '/tmp/enebular-local-agent.socket';
var agent = void 0;
var server = void 0;

function shutdown() {
  //
}

if (require.main === module) {
  startup();
}

exports.startup = startup;
exports.shutdown = shutdown;

// todo: server.close(), unlink handling on signal etc