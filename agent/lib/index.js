'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _stringify = require('babel-runtime/core-js/json/stringify');

var _stringify2 = _interopRequireDefault(_stringify);

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

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

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
var log = (0, _debug2.default)('enebular-runtime-agent');

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
    this._agentMan = new _agentManagerMediator2.default(this._nodeRed);
    this._configFile = configFile;
    this._agentState = 'init';
  }

  (0, _createClass3.default)(EnebularAgent, [{
    key: 'startup',
    value: function () {
      var _ref = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee() {
        return _regenerator2.default.wrap(function _callee$(_context) {
          while (1) {
            switch (_context.prev = _context.next) {
              case 0:
                this._loadAgentConfig();
                return _context.abrupt('return', this._nodeRed.startService());

              case 2:
              case 'end':
                return _context.stop();
            }
          }
        }, _callee, this);
      }));

      function startup() {
        return _ref.apply(this, arguments);
      }

      return startup;
    }()
  }, {
    key: 'shutdown',
    value: function () {
      var _ref2 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee2() {
        return _regenerator2.default.wrap(function _callee2$(_context2) {
          while (1) {
            switch (_context2.prev = _context2.next) {
              case 0:
                return _context2.abrupt('return', this._nodeRed.shutdownService());

              case 1:
              case 'end':
                return _context2.stop();
            }
          }
        }, _callee2, this);
      }));

      function shutdown() {
        return _ref2.apply(this, arguments);
      }

      return shutdown;
    }()
  }, {
    key: '_loadAgentConfig',
    value: function _loadAgentConfig() {
      log('_loadAgentConfig');
      try {
        if (_fs2.default.existsSync(this._configFile)) {
          log('reading config file', this._configFile);
          var data = _fs2.default.readFileSync(this._configFile, 'utf8');

          var _JSON$parse = JSON.parse(data),
              _connectionId = _JSON$parse.connectionId,
              _deviceId = _JSON$parse.deviceId,
              _agentManagerBaseUrl = _JSON$parse.agentManagerBaseUrl,
              _authRequestUrl = _JSON$parse.authRequestUrl;

          if (_connectionId && _deviceId && _agentManagerBaseUrl && _authRequestUrl) {
            this._registerAgentInfo({ connectionId: _connectionId, deviceId: _deviceId, agentManagerBaseUrl: _agentManagerBaseUrl, authRequestUrl: _authRequestUrl });
            this._changeAgentState('registered');
          } else {
            this._changeAgentState('unregistered');
          }
        } else {
          log('creating new config file ', this._configFile);
          _fs2.default.writeFileSync(this._configFile, '{}', 'utf8');
          this._changeAgentState('unregistered');
        }
      } catch (e) {
        console.error(e);
        this._changeAgentState('unregistered');
      }
    }
  }, {
    key: '_changeAgentState',
    value: function _changeAgentState(nextState) {
      log('_changeAgentState', this._agentState, '=>', nextState);
      if (isPossibleStateTransition(this._agentState, nextState)) {
        this._agentState = nextState;
        log('*** agent state : ' + this._agentState + ' ***');
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
    key: '_registerAgentInfo',
    value: function _registerAgentInfo(_ref3) {
      var connectionId = _ref3.connectionId,
          deviceId = _ref3.deviceId,
          authRequestUrl = _ref3.authRequestUrl,
          agentManagerBaseUrl = _ref3.agentManagerBaseUrl;

      log('connectionId', connectionId);
      log('deviceId', deviceId);
      log('authRequestUrl', authRequestUrl);
      log('agentManagerBaseUrl', agentManagerBaseUrl);
      this._connectionId = connectionId;
      this._deviceId = deviceId;
      this._deviceAuth.setAuthRequestUrl(authRequestUrl);
      this._agentMan.setBaseUrl(agentManagerBaseUrl);
      var data = (0, _stringify2.default)({ connectionId: connectionId, deviceId: deviceId, authRequestUrl: authRequestUrl, agentManagerBaseUrl: agentManagerBaseUrl });
      _fs2.default.writeFileSync(this._configFile, data, 'utf8');
    }
  }, {
    key: '_handleChangeState',
    value: function () {
      var _ref4 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee3() {
        return _regenerator2.default.wrap(function _callee3$(_context3) {
          while (1) {
            switch (_context3.prev = _context3.next) {
              case 0:
                _context3.t0 = this._agentState;
                _context3.next = _context3.t0 === 'registered' ? 3 : _context3.t0 === 'unregistered' ? 6 : _context3.t0 === 'authenticated' ? 7 : 10;
                break;

              case 3:
                _context3.next = 5;
                return this._requestDeviceAuthentication();

              case 5:
                return _context3.abrupt('break', 10);

              case 6:
                return _context3.abrupt('break', 10);

              case 7:
                _context3.next = 9;
                return this._startStatusNotification();

              case 9:
                return _context3.abrupt('break', 10);

              case 10:
              case 'end':
                return _context3.stop();
            }
          }
        }, _callee3, this);
      }));

      function _handleChangeState() {
        return _ref4.apply(this, arguments);
      }

      return _handleChangeState;
    }()
  }, {
    key: '_requestDeviceAuthentication',
    value: function () {
      var _ref5 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee4() {
        var connectionId, deviceId, _ref6, accessToken;

        return _regenerator2.default.wrap(function _callee4$(_context4) {
          while (1) {
            switch (_context4.prev = _context4.next) {
              case 0:
                log('_requestDeviceAuthentication');
                connectionId = this._connectionId, deviceId = this._deviceId;

                if (!(!connectionId || !deviceId)) {
                  _context4.next = 4;
                  break;
                }

                throw new Error('Connection ID and Device ID are not configured yet for the agent');

              case 4:
                _context4.prev = 4;
                _context4.next = 7;
                return this._deviceAuth.requestAuthenticate(connectionId, deviceId);

              case 7:
                _ref6 = _context4.sent;
                accessToken = _ref6.accessToken;

                this._agentMan.setAccessToken(accessToken);
                this._changeAgentState('authenticated');
                _context4.next = 18;
                break;

              case 13:
                _context4.prev = 13;
                _context4.t0 = _context4['catch'](4);

                log('err---', _context4.t0);
                this._changeAgentState('unauthenticated');
                throw _context4.t0;

              case 18:
              case 'end':
                return _context4.stop();
            }
          }
        }, _callee4, this, [[4, 13]]);
      }));

      function _requestDeviceAuthentication() {
        return _ref5.apply(this, arguments);
      }

      return _requestDeviceAuthentication;
    }()
  }, {
    key: '_startStatusNotification',
    value: function () {
      var _ref7 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee5() {
        return _regenerator2.default.wrap(function _callee5$(_context5) {
          while (1) {
            switch (_context5.prev = _context5.next) {
              case 0:
                log('_startStatusNotification');
                // this._agentMan.startStatusReport();
                this._startRecordLogs();

              case 2:
              case 'end':
                return _context5.stop();
            }
          }
        }, _callee5, this);
      }));

      function _startStatusNotification() {
        return _ref7.apply(this, arguments);
      }

      return _startStatusNotification;
    }()
  }, {
    key: '_startRecordLogs',
    value: function () {
      var _ref8 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee6() {
        return _regenerator2.default.wrap(function _callee6$(_context6) {
          while (1) {
            switch (_context6.prev = _context6.next) {
              case 0:
                this._agentMan.startLogReport();

              case 1:
              case 'end':
                return _context6.stop();
            }
          }
        }, _callee6, this);
      }));

      function _startRecordLogs() {
        return _ref8.apply(this, arguments);
      }

      return _startRecordLogs;
    }()

    /**
     *
     */

  }, {
    key: 'handleDeviceMasterMessage',
    value: function handleDeviceMasterMessage(messageType, message) {
      log('handleDeviceMasterMessage', messageType, message);
      switch (messageType) {
        case 'register':
          if (this._agentState === 'init' || this._agentState === 'unregistered') {
            var _connectionId2 = message.connectionId,
                _deviceId2 = message.deviceId,
                _agentManagerBaseUrl2 = message.agentManagerBaseUrl,
                _authRequestUrl2 = message.authRequestUrl;

            this._registerAgentInfo({ connectionId: _connectionId2, deviceId: _deviceId2, agentManagerBaseUrl: _agentManagerBaseUrl2, authRequestUrl: _authRequestUrl2 });
            this._changeAgentState('registered');
          }
          break;
        default:
          break;
      }
      this._messageEmitter.emit(messageType, message);
    }
  }]);
  return EnebularAgent;
}();

exports.default = EnebularAgent;