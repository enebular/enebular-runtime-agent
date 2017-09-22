'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _regenerator = require('babel-runtime/regenerator');

var _regenerator2 = _interopRequireDefault(_regenerator);

var _asyncToGenerator2 = require('babel-runtime/helpers/asyncToGenerator');

var _asyncToGenerator3 = _interopRequireDefault(_asyncToGenerator2);

var fetchAndUpdateFlow = function () {
  var _ref = (0, _asyncToGenerator3.default)(_regenerator2.default.mark(function _callee(params) {
    return _regenerator2.default.wrap(function _callee$(_context) {
      while (1) {
        switch (_context.prev = _context.next) {
          case 0:
            console.log('fetchAndUpdateFlow', params);
            _context.next = 3;
            return agent.downloadAndUpdatePackage(params.downloadUrl);

          case 3:
            _context.next = 5;
            return agent.restartService();

          case 5:
          case 'end':
            return _context.stop();
        }
      }
    }, _callee, this);
  }));

  return function fetchAndUpdateFlow(_x) {
    return _ref.apply(this, arguments);
  };
}();

exports.startup = startup;

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _awsIotDeviceSdk = require('aws-iot-device-sdk');

var _awsIotDeviceSdk2 = _interopRequireDefault(_awsIotDeviceSdk);

var _isomorphicFetch = require('isomorphic-fetch');

var _isomorphicFetch2 = _interopRequireDefault(_isomorphicFetch);

var _enebularRuntimeAgent = require('enebular-runtime-agent');

var _enebularRuntimeAgent2 = _interopRequireDefault(_enebularRuntimeAgent);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var agent = new _enebularRuntimeAgent2.default({
  command: 'npm',
  args: ['run', 'start'],
  pkgDir: process.env.NODE_RED_DIR
});

var device = void 0;

function updateThingState(thingName, state) {
  device.update(thingName, { state: { reported: state } });
}

function setupDevice(config) {
  var _this = this;

  var device = _awsIotDeviceSdk2.default.thingShadow(config);

  device.on('connect', (0, _asyncToGenerator3.default)(_regenerator2.default.mark(function _callee2() {
    return _regenerator2.default.wrap(function _callee2$(_context2) {
      while (1) {
        switch (_context2.prev = _context2.next) {
          case 0:
            console.log('>> connected to AWS IoT');
            device.register(config.thingName, { ignoreDeltas: false, persistentSubscribe: true });
            setTimeout(function () {
              return device.get(config.thingName);
            }, 2000);
            _context2.next = 5;
            return agent.restartService();

          case 5:
          case 'end':
            return _context2.stop();
        }
      }
    }, _callee2, _this);
  })));

  device.on('close', function () {
    console.log('>> AWS IoT connection closed');
    device.unregister(config.thingName);
  });

  device.on('reconnect', function () {
    console.log('>> reconnect to AWS IoT');
    device.register(config.thingName);
  });

  device.on('error', function (error) {
    console.log('## error', error);
  });

  device.on('offline', function () {
    console.log('>> offline : no AWS IoT connection established');
  });

  device.once('status', function () {
    var _ref3 = (0, _asyncToGenerator3.default)(_regenerator2.default.mark(function _callee3(thingName, stat, clientToken, stateObject) {
      var state, metadata;
      return _regenerator2.default.wrap(function _callee3$(_context3) {
        while (1) {
          switch (_context3.prev = _context3.next) {
            case 0:
              state = stateObject.state;
              metadata = stateObject.metadata;

              if (!state.desired.package) {
                _context3.next = 6;
                break;
              }

              _context3.next = 5;
              return fetchAndUpdateFlow(state.desired.package);

            case 5:
              updateThingState(config.thingName, { package: state.desired.package });

            case 6:
            case 'end':
              return _context3.stop();
          }
        }
      }, _callee3, _this);
    }));

    return function (_x2, _x3, _x4, _x5) {
      return _ref3.apply(this, arguments);
    };
  }());

  device.on('delta', function () {
    var _ref4 = (0, _asyncToGenerator3.default)(_regenerator2.default.mark(function _callee4(thingName, stateObject) {
      var state, metadata;
      return _regenerator2.default.wrap(function _callee4$(_context4) {
        while (1) {
          switch (_context4.prev = _context4.next) {
            case 0:
              state = stateObject.state;
              metadata = stateObject.metadata;

              if (!state.package) {
                _context4.next = 6;
                break;
              }

              _context4.next = 5;
              return fetchAndUpdateFlow(state.package);

            case 5:
              updateThingState(config.thingName, { package: state.package });

            case 6:
            case 'end':
              return _context4.stop();
          }
        }
      }, _callee4, _this);
    }));

    return function (_x6, _x7) {
      return _ref4.apply(this, arguments);
    };
  }());

  return device;
}

function startup() {
  console.log(process.argv);
  var configFile = process.env.AWSIOT_CONFIG_FILE || process.argv[2] || './config.json';
  console.log('configFile=', configFile);
  var config = JSON.parse(_fs2.default.readFileSync(configFile));
  console.log('awsiot config=>', config);
  device = setupDevice(config);
  console.log('agent started up');
}

if (require.main === module) {
  startup();
}