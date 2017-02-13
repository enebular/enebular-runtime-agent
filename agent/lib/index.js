'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _regenerator = require('babel-runtime/regenerator');

var _regenerator2 = _interopRequireDefault(_regenerator);

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

var _asyncToGenerator2 = require('babel-runtime/helpers/asyncToGenerator');

var _asyncToGenerator3 = _interopRequireDefault(_asyncToGenerator2);

var _classCallCheck2 = require('babel-runtime/helpers/classCallCheck');

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require('babel-runtime/helpers/createClass');

var _createClass3 = _interopRequireDefault(_createClass2);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _child_process = require('child_process');

var _unzip = require('unzip2');

var _unzip2 = _interopRequireDefault(_unzip);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 *
 */
var EnebularAgent = function () {
  function EnebularAgent(_ref) {
    var command = _ref.command,
        args = _ref.args,
        pkgDir = _ref.pkgDir;
    (0, _classCallCheck3.default)(this, EnebularAgent);

    this._command = command;
    this._args = args;
    this._pkgDir = pkgDir;
  }

  (0, _createClass3.default)(EnebularAgent, [{
    key: 'updatePackage',
    value: function () {
      var _ref2 = (0, _asyncToGenerator3.default)(_regenerator2.default.mark(function _callee(pkgStream) {
        var _this = this;

        return _regenerator2.default.wrap(function _callee$(_context) {
          while (1) {
            switch (_context.prev = _context.next) {
              case 0:
                return _context.abrupt('return', new _promise2.default(function (resolve, reject) {
                  pkgStream.pipe(_unzip2.default.Extract({ path: _this._pkgDir })).on('finish', resolve).on('error', reject);
                }));

              case 1:
              case 'end':
                return _context.stop();
            }
          }
        }, _callee, this);
      }));

      function updatePackage(_x) {
        return _ref2.apply(this, arguments);
      }

      return updatePackage;
    }()
  }, {
    key: 'startService',
    value: function () {
      var _ref3 = (0, _asyncToGenerator3.default)(_regenerator2.default.mark(function _callee2() {
        var _this2 = this;

        return _regenerator2.default.wrap(function _callee2$(_context2) {
          while (1) {
            switch (_context2.prev = _context2.next) {
              case 0:
                return _context2.abrupt('return', new _promise2.default(function (resolve, reject) {
                  _this2._cproc = (0, _child_process.spawn)(_this2._command, _this2._args, { stdio: 'inherit', cwd: _this2._pkgDir });
                  _this2._cproc.on('error', reject);
                  _this2._cproc.once('exit', resolve);
                }));

              case 1:
              case 'end':
                return _context2.stop();
            }
          }
        }, _callee2, this);
      }));

      function startService() {
        return _ref3.apply(this, arguments);
      }

      return startService;
    }()
  }, {
    key: 'shutdownService',
    value: function () {
      var _ref4 = (0, _asyncToGenerator3.default)(_regenerator2.default.mark(function _callee3() {
        var _this3 = this;

        return _regenerator2.default.wrap(function _callee3$(_context3) {
          while (1) {
            switch (_context3.prev = _context3.next) {
              case 0:
                return _context3.abrupt('return', new _promise2.default(function (resolve, reject) {
                  if (_this3._cproc) {
                    _this3._cproc.kill();
                    _this3._cproc.once('exit', function () {
                      _this3._cproc = null;
                      resolve();
                    });
                  } else {
                    resolve();
                  }
                }));

              case 1:
              case 'end':
                return _context3.stop();
            }
          }
        }, _callee3, this);
      }));

      function shutdownService() {
        return _ref4.apply(this, arguments);
      }

      return shutdownService;
    }()
  }, {
    key: 'restartService',
    value: function () {
      var _ref5 = (0, _asyncToGenerator3.default)(_regenerator2.default.mark(function _callee4() {
        return _regenerator2.default.wrap(function _callee4$(_context4) {
          while (1) {
            switch (_context4.prev = _context4.next) {
              case 0:
                _context4.next = 2;
                return this.shutdownService();

              case 2:
                _context4.next = 4;
                return this.startService();

              case 4:
              case 'end':
                return _context4.stop();
            }
          }
        }, _callee4, this);
      }));

      function restartService() {
        return _ref5.apply(this, arguments);
      }

      return restartService;
    }()
  }]);
  return EnebularAgent;
}();

exports.default = EnebularAgent;