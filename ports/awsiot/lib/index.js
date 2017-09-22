'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.shutdown = exports.startup = undefined;

var _regenerator = require('babel-runtime/regenerator');

var _regenerator2 = _interopRequireDefault(_regenerator);

var _asyncToGenerator2 = require('babel-runtime/helpers/asyncToGenerator');

var _asyncToGenerator3 = _interopRequireDefault(_asyncToGenerator2);

/**
 *
 */
var startup = function () {
  var _ref4 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee4() {
    var awsIoTConfigFile, awsIotConfig;
    return _regenerator2.default.wrap(function _callee4$(_context4) {
      while (1) {
        switch (_context4.prev = _context4.next) {
          case 0:
            _context4.prev = 0;

            agent = new _enebularRuntimeAgent2.default({
              nodeRedDir: NODE_RED_DIR || _path2.default.join(process.cwd(), 'node-red'),
              configFile: _path2.default.join(process.cwd(), '.enebular-config.json')
            });

            awsIoTConfigFile = AWSIOT_CONFIG_FILE || _path2.default.join(process.cwd(), './config.json');

            log('AWS IoT config file =', awsIoTConfigFile);
            awsIotConfig = JSON.parse(_fs2.default.readFileSync(awsIoTConfigFile, 'utf8'));

            setupDevice(awsIotConfig, agent);

            _context4.next = 8;
            return agent.startup();

          case 8:
            log('### enebular agent started up ####');
            return _context4.abrupt('return', agent);

          case 12:
            _context4.prev = 12;
            _context4.t0 = _context4['catch'](0);

            console.error(_context4.t0);
            process.exit(1);

          case 16:
          case 'end':
            return _context4.stop();
        }
      }
    }, _callee4, this, [[0, 12]]);
  }));

  return function startup() {
    return _ref4.apply(this, arguments);
  };
}();

/**
 *
 */


var shutdown = function () {
  var _ref5 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee5() {
    return _regenerator2.default.wrap(function _callee5$(_context5) {
      while (1) {
        switch (_context5.prev = _context5.next) {
          case 0:
            return _context5.abrupt('return', agent.shutdown());

          case 1:
          case 'end':
            return _context5.stop();
        }
      }
    }, _callee5, this);
  }));

  return function shutdown() {
    return _ref5.apply(this, arguments);
  };
}();

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _awsIotDeviceSdk = require('aws-iot-device-sdk');

var _awsIotDeviceSdk2 = _interopRequireDefault(_awsIotDeviceSdk);

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

var _enebularRuntimeAgent = require('enebular-runtime-agent');

var _enebularRuntimeAgent2 = _interopRequireDefault(_enebularRuntimeAgent);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 *
 */
var log = (0, _debug2.default)('enebular-awsiot-agent');
var _process$env = process.env,
    AWSIOT_CONFIG_FILE = _process$env.AWSIOT_CONFIG_FILE,
    NODE_RED_DIR = _process$env.NODE_RED_DIR;

/**
 *
 */

function isThingShadowSynced(metadata, property) {
  var desiredTimestamp = (metadata.desired && metadata.desired[property] || {}).timestamp;
  var reportedTimestamp = (metadata.reported && metadata.reported[property] || {}).timestamp;
  return reportedTimestamp >= desiredTimestamp;
}

/**
 *
 */


function setupDevice(config, agent) {
  var _this = this;

  var device = _awsIotDeviceSdk2.default.thingShadow(config);

  device.on('connect', (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee() {
    return _regenerator2.default.wrap(function _callee$(_context) {
      while (1) {
        switch (_context.prev = _context.next) {
          case 0:
            log('>> connected to AWS IoT');
            device.register(config.thingName, { ignoreDeltas: false, persistentSubscribe: true });
            setTimeout(function () {
              return device.get(config.thingName);
            }, 2000);

          case 3:
          case 'end':
            return _context.stop();
        }
      }
    }, _callee, _this);
  })));

  device.on('close', function () {
    log('>> AWS IoT connection closed');
    device.unregister(config.thingName);
  });

  device.on('reconnect', function () {
    log('>> reconnect to AWS IoT');
    device.register(config.thingName);
  });

  device.on('error', function (error) {
    log('## error', error);
  });

  device.on('offline', function () {
    log('>> offline : no AWS IoT connection established');
  });

  device.on('message', function (topic, payload) {
    log('>> message', topic, payload);
  });

  device.once('status', function () {
    var _ref2 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee2(thingName, stat, clientToken, stateObject) {
      var state, metadata, _state$desired$messag, messageType, message, newState;

      return _regenerator2.default.wrap(function _callee2$(_context2) {
        while (1) {
          switch (_context2.prev = _context2.next) {
            case 0:
              log('>> status', stateObject);
              state = stateObject.state;
              metadata = stateObject.metadata;

              if (state.desired.message && !isThingShadowSynced(metadata, 'message')) {
                _state$desired$messag = state.desired.message, messageType = _state$desired$messag.messageType, message = _state$desired$messag.message;

                agent.handleDeviceMasterMessage(messageType, message);
                newState = { message: state.desired.message };

                device.update(thingName, { state: { reported: newState } });
              }

            case 4:
            case 'end':
              return _context2.stop();
          }
        }
      }, _callee2, _this);
    }));

    return function (_x, _x2, _x3, _x4) {
      return _ref2.apply(this, arguments);
    };
  }());

  device.on('delta', function () {
    var _ref3 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee3(thingName, stateObject) {
      var state, metadata, _state$message, messageType, message, newState;

      return _regenerator2.default.wrap(function _callee3$(_context3) {
        while (1) {
          switch (_context3.prev = _context3.next) {
            case 0:
              log('>> delta', stateObject);
              state = stateObject.state;
              metadata = stateObject.metadata;

              if (state.message && !isThingShadowSynced(metadata, 'message')) {
                _state$message = state.message, messageType = _state$message.messageType, message = _state$message.message;

                agent.handleDeviceMasterMessage(messageType, message);
                newState = { message: state.message };

                device.update(thingName, { state: { reported: newState } });
              }

            case 4:
            case 'end':
              return _context3.stop();
          }
        }
      }, _callee3, _this);
    }));

    return function (_x5, _x6) {
      return _ref3.apply(this, arguments);
    };
  }());
}

var agent = void 0;

if (require.main === module) {
  startup();
}

exports.startup = startup;
exports.shutdown = shutdown;