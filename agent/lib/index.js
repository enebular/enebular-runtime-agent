'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _regenerator = require('babel-runtime/regenerator');

var _regenerator2 = _interopRequireDefault(_regenerator);

var _asyncToGenerator2 = require('babel-runtime/helpers/asyncToGenerator');

var _asyncToGenerator3 = _interopRequireDefault(_asyncToGenerator2);

var _classCallCheck2 = require('babel-runtime/helpers/classCallCheck');

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require('babel-runtime/helpers/createClass');

var _createClass3 = _interopRequireDefault(_createClass2);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _os = require('os');

var _os2 = _interopRequireDefault(_os);

var _events = require('events');

var _events2 = _interopRequireDefault(_events);

var _nodeRedController = require('./node-red-controller');

var _nodeRedController2 = _interopRequireDefault(_nodeRedController);

var _deviceAuthMediator = require('./device-auth-mediator');

var _deviceAuthMediator2 = _interopRequireDefault(_deviceAuthMediator);

var _agentManagerMediator = require('./agent-manager-mediator');

var _agentManagerMediator2 = _interopRequireDefault(_agentManagerMediator);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 *
 */


/**
 *
 */
function isPossibleStateTransition(state, nextState) {
  switch (state) {
    case 'init':
      return nextState === 'registered' || nextState === 'unregistered';
    case 'registered':
      return nextState === 'authenticated' || nextState === 'unauthenticated';
    case 'unregistered':
      return nextState === 'registered';
    case 'authenticated':
      return nextState === 'unauthenticated';
    case 'unauthenticated':
      return nextState === 'authenticated';
  }
}

/**
 *
 */

var EnebularAgent = function () {
  function EnebularAgent(config) {
    (0, _classCallCheck3.default)(this, EnebularAgent);
    var nodeRedDir = config.nodeRedDir,
        _config$nodeRedComman = config.nodeRedCommand,
        nodeRedCommand = _config$nodeRedComman === undefined ? 'npm start' : _config$nodeRedComman,
        _config$configFile = config.configFile,
        configFile = _config$configFile === undefined ? _path2.default.join(_os2.default.homedir(), '.enebular-config.json') : _config$configFile;

    this._messageEmitter = new _events2.default();
    this._nodeRed = new _nodeRedController2.default(nodeRedDir, nodeRedCommand, this._messageEmitter);
    this._deviceAuth = new _deviceAuthMediator2.default(this._messageEmitter);
    this._agentMan = new _agentManagerMediator2.default();
    this._configFile = configFile;
    this._agentState = 'init';
  }

  (0, _createClass3.default)(EnebularAgent, [{
    key: 'start',
    value: function () {
      var _ref = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee() {
        return _regenerator2.default.wrap(function _callee$(_context) {
          while (1) {
            switch (_context.prev = _context.next) {
              case 0:
                this._loadAgentConfig();
                return _context.abrupt('return', this._messageEmitter.emit('start', {}));

              case 2:
              case 'end':
                return _context.stop();
            }
          }
        }, _callee, this);
      }));

      function start() {
        return _ref.apply(this, arguments);
      }

      return start;
    }()
  }, {
    key: '_loadAgentConfig',
    value: function _loadAgentConfig() {
      try {
        var data = _fs2.default.readFileSync(this._configFile, 'utf8');

        var _JSON$parse = JSON.parse(data),
            connectionId = _JSON$parse.connectionId,
            deviceId = _JSON$parse.deviceId,
            agentManagerBaseUrl = _JSON$parse.agentManagerBaseUrl,
            authRequestUrl = _JSON$parse.authRequestUrl;

        if (connectionId && deviceId && agentManagerBaseUrl && authRequestUrl) {
          this._connectionId = deviceId;
          this._deviceId = deviceId;
          this._deviceAuth.setAuthRequestUrl(authRequestUrl);
          this._agentMan.setBaseUrl(agentManagerBaseUrl);
          this._changeAgentState('registered');
        }
      } catch (e) {
        console.error(e);
        this._changeAgentState('unregistered');
      }
    }
  }, {
    key: '_changeAgentState',
    value: function _changeAgentState(nextState) {
      if (isPossibleStateTransition(this._agentState, nextState)) {
        this._agentState = nextState;
        console.log('*** agent state : ' + this._agentState + ' ***');
        try {
          this._handleChangeState();
        } catch (err) {
          console.error(err);
        }
      } else {
        console.warn('Impossible state transition requested : ' + this._agentState + ' => ' + nextState);
      }
    }
  }, {
    key: '_handleChangeState',
    value: function () {
      var _ref2 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee2() {
        return _regenerator2.default.wrap(function _callee2$(_context2) {
          while (1) {
            switch (_context2.prev = _context2.next) {
              case 0:
                _context2.t0 = this._agentState;
                _context2.next = _context2.t0 === 'registered' ? 3 : _context2.t0 === 'unregistered' ? 6 : _context2.t0 === 'authenticated' ? 7 : 10;
                break;

              case 3:
                _context2.next = 5;
                return this._requestDeviceAuthentication();

              case 5:
                return _context2.abrupt('break', 10);

              case 6:
                return _context2.abrupt('break', 10);

              case 7:
                _context2.next = 9;
                return this._startStatusNotification();

              case 9:
                return _context2.abrupt('break', 10);

              case 10:
              case 'end':
                return _context2.stop();
            }
          }
        }, _callee2, this);
      }));

      function _handleChangeState() {
        return _ref2.apply(this, arguments);
      }

      return _handleChangeState;
    }()
  }, {
    key: '_requestDeviceAuthentication',
    value: function () {
      var _ref3 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee3() {
        var connectionId, deviceId, _ref4, accessToken;

        return _regenerator2.default.wrap(function _callee3$(_context3) {
          while (1) {
            switch (_context3.prev = _context3.next) {
              case 0:
                connectionId = this._connectionId, deviceId = this._deviceId;

                if (!(!connectionId || !deviceId)) {
                  _context3.next = 3;
                  break;
                }

                throw new Error('Connection ID and Device ID are not configured yet for the agent');

              case 3:
                _context3.prev = 3;
                _context3.next = 6;
                return this._deviceAuth.requestAuthenticate(connectionId, deviceId);

              case 6:
                _ref4 = _context3.sent;
                accessToken = _ref4.accessToken;

                this._agentMan.setAccessToken(accessToken);
                this._changeAgentState('authenticated');
                _context3.next = 16;
                break;

              case 12:
                _context3.prev = 12;
                _context3.t0 = _context3['catch'](3);

                this._changeAgentState('unauthenticated');
                throw _context3.t0;

              case 16:
              case 'end':
                return _context3.stop();
            }
          }
        }, _callee3, this, [[3, 12]]);
      }));

      function _requestDeviceAuthentication() {
        return _ref3.apply(this, arguments);
      }

      return _requestDeviceAuthentication;
    }()
  }, {
    key: '_startStatusNotification',
    value: function () {
      var _ref5 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee4() {
        return _regenerator2.default.wrap(function _callee4$(_context4) {
          while (1) {
            switch (_context4.prev = _context4.next) {
              case 0:
                this._agentMan.startStatusReport();

              case 1:
              case 'end':
                return _context4.stop();
            }
          }
        }, _callee4, this);
      }));

      function _startStatusNotification() {
        return _ref5.apply(this, arguments);
      }

      return _startStatusNotification;
    }()

    /**
     *
     */

  }, {
    key: 'handleDeviceMasterMessage',
    value: function handleDeviceMasterMessage(messageType, message) {
      console.log('handleDeviceMasterMessage', messageType, message);
      this._messageEmitter.emit(messageType, message);
    }
  }]);
  return EnebularAgent;
}();

exports.default = EnebularAgent;