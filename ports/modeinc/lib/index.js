'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.shutdown = exports.startup = undefined;

var _regenerator = require('babel-runtime/regenerator');

var _regenerator2 = _interopRequireDefault(_regenerator);

var _asyncToGenerator2 = require('babel-runtime/helpers/asyncToGenerator');

var _asyncToGenerator3 = _interopRequireDefault(_asyncToGenerator2);

var startup = function () {
  var _ref = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee() {
    return _regenerator2.default.wrap(function _callee$(_context) {
      while (1) {
        switch (_context.prev = _context.next) {
          case 0:
            _context.prev = 0;

            device.commandCallback = function (msg, flags) {
              agent.handleDeviceMasterMessage(msg.action, msg.parameters);
            };
            device.listenCommands();
            _context.next = 5;
            return agent.startup();

          case 5:
            console.log('### mode enebular agent started up ####');
            return _context.abrupt('return', agent);

          case 9:
            _context.prev = 9;
            _context.t0 = _context['catch'](0);

            console.error(_context.t0);
            process.exit(1);

          case 13:
          case 'end':
            return _context.stop();
        }
      }
    }, _callee, this, [[0, 9]]);
  }));

  return function startup() {
    return _ref.apply(this, arguments);
  };
}();

var shutdown = function () {
  var _ref2 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee2() {
    return _regenerator2.default.wrap(function _callee2$(_context2) {
      while (1) {
        switch (_context2.prev = _context2.next) {
          case 0:
            return _context2.abrupt('return', agent.shutdown());

          case 1:
          case 'end':
            return _context2.stop();
        }
      }
    }, _callee2, this);
  }));

  return function shutdown() {
    return _ref2.apply(this, arguments);
  };
}();

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _modeDevice = require('mode-device');

var _modeDevice2 = _interopRequireDefault(_modeDevice);

var _enebularRuntimeAgent = require('enebular-runtime-agent');

var _enebularRuntimeAgent2 = _interopRequireDefault(_enebularRuntimeAgent);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var _process$env = process.env,
    DEVICE_ID = _process$env.DEVICE_ID,
    DEVICE_API_KEY = _process$env.DEVICE_API_KEY,
    NODE_RED_DIR = _process$env.NODE_RED_DIR;


var device = new _modeDevice2.default(DEVICE_ID, DEVICE_API_KEY);
var agent = new _enebularRuntimeAgent2.default({
  nodeRedDir: NODE_RED_DIR || _path2.default.join(process.cwd(), 'node-red'),
  configFile: _path2.default.join(process.cwd(), '.enebular-config.json')
});

if (require.main === module) {
  startup();
}

exports.startup = startup;
exports.shutdown = shutdown;