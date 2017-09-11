'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

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

var _crypto = require('crypto');

var _crypto2 = _interopRequireDefault(_crypto);

var _jsonwebtoken = require('jsonwebtoken');

var _jsonwebtoken2 = _interopRequireDefault(_jsonwebtoken);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 *
 */
var AUTH_TOKEN_TIMEOUT = 10000;

var DeviceAuthMediator = function (_EventEmitter) {
  (0, _inherits3.default)(DeviceAuthMediator, _EventEmitter);

  function DeviceAuthMediator(emitter) {
    (0, _classCallCheck3.default)(this, DeviceAuthMediator);

    var _this = (0, _possibleConstructorReturn3.default)(this, (DeviceAuthMediator.__proto__ || (0, _getPrototypeOf2.default)(DeviceAuthMediator)).call(this));

    _this._seq = 0;

    emitter.on('dispatch_auth_token', function (message) {
      return _this.emit('dispatch_auth_token', message);
    });
    return _this;
  }

  (0, _createClass3.default)(DeviceAuthMediator, [{
    key: 'setAuthRequestUrl',
    value: function setAuthRequestUrl(authRequestUrl) {
      this._authRequestUrl = authRequestUrl;
    }
  }, {
    key: 'requestAuthenticate',
    value: function () {
      var _ref = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee(connectionId, deviceId) {
        var authRequestUrl, nonce, state, tokens_, res, tokens;
        return _regenerator2.default.wrap(function _callee$(_context) {
          while (1) {
            switch (_context.prev = _context.next) {
              case 0:
                authRequestUrl = this._authRequestUrl;

                if (authRequestUrl) {
                  _context.next = 3;
                  break;
                }

                throw new Error('Authentication Request URL is not configured correctly');

              case 3:
                nonce = _crypto2.default.randomBytes(16).toString('hex');

                this._nonce = nonce;
                this._seq++;
                state = 'req-' + this._seq;
                tokens_ = this._waitTokens();
                _context.next = 10;
                return fetch(authRequestUrl, {
                  method: 'POST',
                  body: (0, _stringify2.default)({ connectionId: connectionId, deviceId: deviceId, nonce: nonce, state: state }),
                  headers: {
                    'Content-Type': 'application/json'
                  }
                });

              case 10:
                res = _context.sent;

                if (res.ok) {
                  _context.next = 16;
                  break;
                }

                this._cleanup();
                throw new Error('Error occurred while requesting device authentication');

              case 16:
                _context.next = 18;
                return tokens_;

              case 18:
                tokens = _context.sent;
                return _context.abrupt('return', tokens);

              case 20:
              case 'end':
                return _context.stop();
            }
          }
        }, _callee, this);
      }));

      function requestAuthenticate(_x, _x2) {
        return _ref.apply(this, arguments);
      }

      return requestAuthenticate;
    }()
  }, {
    key: '_waitTokens',
    value: function () {
      var _ref2 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee2() {
        var _this2 = this;

        var seq;
        return _regenerator2.default.wrap(function _callee2$(_context2) {
          while (1) {
            switch (_context2.prev = _context2.next) {
              case 0:
                seq = this._seq;
                return _context2.abrupt('return', new _promise2.default(function (resolve, reject) {
                  _this2.on('dispatch_auth_token', function (_ref3) {
                    var id_token = _ref3.id_token,
                        access_token = _ref3.access_token,
                        state = _ref3.state;

                    var _jwt$decode = _jsonwebtoken2.default.decode(id_token),
                        payload = _jwt$decode.payload;

                    if (state === 'req-' + _this2._seq && payload.nonce && payload.nonce === _this2._nonce) {
                      _this2._cleanup();
                      resolve({ idToken: id_token, accessToken: access_token });
                    }
                  });
                  setTimeout(function () {
                    if (_this2._seq === seq) {
                      _this2._cleanup();
                      reject(new Error('Device Authentication Timeout.'));
                    }
                  }, AUTH_TOKEN_TIMEOUT);
                }));

              case 2:
              case 'end':
                return _context2.stop();
            }
          }
        }, _callee2, this);
      }));

      function _waitTokens() {
        return _ref2.apply(this, arguments);
      }

      return _waitTokens;
    }()
  }, {
    key: '_cleanup',
    value: function _cleanup() {
      this._nonce = null;
      this.removeAllListeners('dispatch_auth_token');
    }
  }]);
  return DeviceAuthMediator;
}(_events2.default);

exports.default = DeviceAuthMediator;