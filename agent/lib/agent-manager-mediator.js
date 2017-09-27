'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _regenerator = require('babel-runtime/regenerator');

var _regenerator2 = _interopRequireDefault(_regenerator);

var _stringify = require('babel-runtime/core-js/json/stringify');

var _stringify2 = _interopRequireDefault(_stringify);

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
      console.log('device shutting down in 5 seconds');
    }
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
        var _ref = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee(kill) {
          var status, res, message, err;
          return _regenerator2.default.wrap(function _callee$(_context) {
            while (1) {
              switch (_context.prev = _context.next) {
                case 0:
                  status = kill ? 'off' : _this2._nodeRed.getStatus();

                  console.log('*** send status notification ***', status);
                  _context.next = 4;
                  return (0, _isomorphicFetch2.default)(baseUrl + '/notify-status', {
                    method: 'POST',
                    headers: {
                      'Authorization': 'Bearer ' + accessToken,
                      'Content-Type': 'application/json'
                    },
                    body: (0, _stringify2.default)({ status: status })
                  });

                case 4:
                  res = _context.sent;

                  if (res.ok) {
                    _context.next = 11;
                    break;
                  }

                  _context.next = 8;
                  return res.text();

                case 8:
                  message = _context.sent;
                  err = new Error('Cannot notify status to agent manager: ');

                  _this2.emit('error', err);

                case 11:
                  kill ? _this2.exitStatusReport() : null;

                case 12:
                case 'end':
                  return _context.stop();
              }
            }
          }, _callee, _this2);
        }));

        return function notifyStatus(_x) {
          return _ref.apply(this, arguments);
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
  }]);
  return AgentManagerMediator;
}(_events2.default);

exports.default = AgentManagerMediator;