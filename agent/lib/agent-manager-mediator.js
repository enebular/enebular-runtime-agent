'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _stringify = require('babel-runtime/core-js/json/stringify');

var _stringify2 = _interopRequireDefault(_stringify);

var _regenerator = require('babel-runtime/regenerator');

var _regenerator2 = _interopRequireDefault(_regenerator);

var _getIterator2 = require('babel-runtime/core-js/get-iterator');

var _getIterator3 = _interopRequireDefault(_getIterator2);

var _asyncToGenerator2 = require('babel-runtime/helpers/asyncToGenerator');

var _asyncToGenerator3 = _interopRequireDefault(_asyncToGenerator2);

var _getPrototypeOf = require('babel-runtime/core-js/object/get-prototype-of');

var _getPrototypeOf2 = _interopRequireDefault(_getPrototypeOf);

var _classCallCheck2 = require('babel-runtime/helpers/classCallCheck');

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require('babel-runtime/helpers/createClass');

var _createClass3 = _interopRequireDefault(_createClass2);

var _possibleConstructorReturn2 = require('babel-runtime/helpers/possibleConstructorReturn');

var _possibleConstructorReturn3 = _interopRequireDefault(_possibleConstructorReturn2);

var _inherits2 = require('babel-runtime/helpers/inherits');

var _inherits3 = _interopRequireDefault(_inherits2);

var _events = require('events');

var _events2 = _interopRequireDefault(_events);

var _isomorphicFetch = require('isomorphic-fetch');

var _isomorphicFetch2 = _interopRequireDefault(_isomorphicFetch);

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

var _nodeRedController = require('./node-red-controller');

var _nodeRedController2 = _interopRequireDefault(_nodeRedController);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _formData = require('form-data');

var _formData2 = _interopRequireDefault(_formData);

var _util = require('util');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 *
 */
var log = (0, _debug2.default)('enebular-runtime-agent:agent-manager-mediator');

/**
 *
 */

var AgentManagerMediator = function (_EventEmitter) {
  (0, _inherits3.default)(AgentManagerMediator, _EventEmitter);

  function AgentManagerMediator(nodeRed) {
    (0, _classCallCheck3.default)(this, AgentManagerMediator);

    var _this = (0, _possibleConstructorReturn3.default)(this, (AgentManagerMediator.__proto__ || (0, _getPrototypeOf2.default)(AgentManagerMediator)).call(this));

    _this._nodeRed = nodeRed;
    return _this;
  }

  (0, _createClass3.default)(AgentManagerMediator, [{
    key: 'setBaseUrl',
    value: function setBaseUrl(baseUrl) {
      log('setBaseUrl', baseUrl);
      this._baseUrl = baseUrl;
    }
  }, {
    key: 'setAccessToken',
    value: function setAccessToken(accessToken) {
      log('accessToken', accessToken);
      this._accessToken = accessToken;
    }
  }, {
    key: 'exitStatusReport',
    value: function exitStatusReport() {
      setTimeout(process.exit, 5000);
      console.log('*** device shutting down in 5 seconds ***');
    }
  }, {
    key: 'startLogReport',
    value: function () {
      var _ref = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee() {
        var baseUrl, accessToken, readDir, readFile, unlink, logList, _iteratorNormalCompletion, _didIteratorError, _iteratorError, _iterator, _step, file, form, res, message, err;

        return _regenerator2.default.wrap(function _callee$(_context) {
          while (1) {
            switch (_context.prev = _context.next) {
              case 0:
                log('startLogReport');
                baseUrl = this._baseUrl, accessToken = this._accessToken;

                if (!(!baseUrl || !accessToken)) {
                  _context.next = 5;
                  break;
                }

                log('Cannnot start status report without baseUrl or access Token.');
                return _context.abrupt('return');

              case 5:
                readDir = (0, _util.promisify)(_fs2.default.readdir);
                readFile = (0, _util.promisify)(_fs2.default.readFile);
                unlink = (0, _util.promisify)(_fs2.default.unlink);
                _context.next = 10;
                return readDir('logs/logs');

              case 10:
                logList = _context.sent;

                console.log('logList----------------------', logList);
                _iteratorNormalCompletion = true;
                _didIteratorError = false;
                _iteratorError = undefined;
                _context.prev = 15;
                _iterator = (0, _getIterator3.default)(logList);

              case 17:
                if (_iteratorNormalCompletion = (_step = _iterator.next()).done) {
                  _context.next = 36;
                  break;
                }

                file = _step.value;
                form = new _formData2.default();

                form.append(file, _fs2.default.createReadStream('logs/logs/' + file));
                _context.next = 23;
                return (0, _isomorphicFetch2.default)(baseUrl + '/record-logs', {
                  method: 'POST',
                  headers: {
                    'Authorization': 'Bearer ' + accessToken,
                    'Content-Type': 'multipart/form-data'
                  },
                  body: form
                });

              case 23:
                res = _context.sent;

                if (res.ok) {
                  _context.next = 31;
                  break;
                }

                _context.next = 27;
                return res.text();

              case 27:
                message = _context.sent;

                console.log('message----------------------', message);
                err = new Error('Cannot record logs to agent manager: ');

                this.emit('error', err);

              case 31:
                _context.next = 33;
                return unlink('logs/logs/' + file);

              case 33:
                _iteratorNormalCompletion = true;
                _context.next = 17;
                break;

              case 36:
                _context.next = 42;
                break;

              case 38:
                _context.prev = 38;
                _context.t0 = _context['catch'](15);
                _didIteratorError = true;
                _iteratorError = _context.t0;

              case 42:
                _context.prev = 42;
                _context.prev = 43;

                if (!_iteratorNormalCompletion && _iterator.return) {
                  _iterator.return();
                }

              case 45:
                _context.prev = 45;

                if (!_didIteratorError) {
                  _context.next = 48;
                  break;
                }

                throw _iteratorError;

              case 48:
                return _context.finish(45);

              case 49:
                return _context.finish(42);

              case 50:
              case 'end':
                return _context.stop();
            }
          }
        }, _callee, this, [[15, 38, 42, 50], [43,, 45, 49]]);
      }));

      function startLogReport() {
        return _ref.apply(this, arguments);
      }

      return startLogReport;
    }()
  }, {
    key: 'startStatusReport',
    value: function startStatusReport() {
      var _this2 = this;

      log('startStatusReport');
      var baseUrl = this._baseUrl,
          accessToken = this._accessToken;

      if (!baseUrl || !accessToken) {
        log('Cannnot start status report without baseUrl or access Token.');
        return;
      }
      var notifyStatus = function () {
        var _ref2 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee2(kill) {
          var status, res, message, err;
          return _regenerator2.default.wrap(function _callee2$(_context2) {
            while (1) {
              switch (_context2.prev = _context2.next) {
                case 0:
                  status = kill ? 'disconnected' : _this2._nodeRed.getStatus();

                  console.log('*** send status notification ***', status);
                  _context2.next = 4;
                  return (0, _isomorphicFetch2.default)(baseUrl + '/notify-status', {
                    method: 'POST',
                    headers: {
                      'Authorization': 'Bearer ' + accessToken,
                      'Content-Type': 'application/json'
                    },
                    body: (0, _stringify2.default)({ status: status })
                  });

                case 4:
                  res = _context2.sent;

                  if (res.ok) {
                    _context2.next = 11;
                    break;
                  }

                  _context2.next = 8;
                  return res.text();

                case 8:
                  message = _context2.sent;
                  err = new Error('Cannot notify status to agent manager: ');

                  _this2.emit('error', err);

                case 11:
                  kill ? _this2.exitStatusReport() : null;

                case 12:
                case 'end':
                  return _context2.stop();
              }
            }
          }, _callee2, _this2);
        }));

        return function notifyStatus(_x) {
          return _ref2.apply(this, arguments);
        };
      }();
      notifyStatus();
      this._pid = setInterval(notifyStatus, 30000);

      var cleanUp = function cleanUp() {
        clearInterval(_this2._pid);
        notifyStatus(true);
      };
      process.on('SIGINT', function () {
        cleanUp();
      });
      process.on('uncaughtException', function () {
        cleanUp();
      });
    }
  }, {
    key: 'sortLogs',
    value: function sortLogs() {}
  }]);
  return AgentManagerMediator;
}(_events2.default);

exports.default = AgentManagerMediator;