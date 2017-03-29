'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _stringify = require('babel-runtime/core-js/json/stringify');

var _stringify2 = _interopRequireDefault(_stringify);

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

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

var _child_process = require('child_process');

var _isomorphicFetch = require('isomorphic-fetch');

var _isomorphicFetch2 = _interopRequireDefault(_isomorphicFetch);

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
    key: 'downloadAndUpdatePackage',
    value: function () {
      var _ref2 = (0, _asyncToGenerator3.default)(_regenerator2.default.mark(function _callee(downloadUrl) {
        var res, params;
        return _regenerator2.default.wrap(function _callee$(_context) {
          while (1) {
            switch (_context.prev = _context.next) {
              case 0:
                _context.next = 2;
                return (0, _isomorphicFetch2.default)(downloadUrl);

              case 2:
                res = _context.sent;

                if (!(res.status >= 400)) {
                  _context.next = 5;
                  break;
                }

                throw new Error('invalid url');

              case 5:
                _context.next = 7;
                return res.json();

              case 7:
                params = _context.sent;
                return _context.abrupt('return', this.updatePackage(params));

              case 9:
              case 'end':
                return _context.stop();
            }
          }
        }, _callee, this);
      }));

      function downloadAndUpdatePackage(_x) {
        return _ref2.apply(this, arguments);
      }

      return downloadAndUpdatePackage;
    }()
  }, {
    key: 'updatePackage',
    value: function () {
      var _ref3 = (0, _asyncToGenerator3.default)(_regenerator2.default.mark(function _callee2(params) {
        var _this = this;

        var writeFile;
        return _regenerator2.default.wrap(function _callee2$(_context2) {
          while (1) {
            switch (_context2.prev = _context2.next) {
              case 0:
                writeFile = _promise2.default.promisify(_fs2.default.writeFile);
                return _context2.abrupt('return', writeFile(_path2.default.join(this._pkgDir, '.node-red-config/flows.json'), (0, _stringify2.default)(params.flow)).then(function (res) {
                  return writeFile(_path2.default.join(_this._pkgDir, '.node-red-config/flows_cred.json'), (0, _stringify2.default)(params.cred));
                }).then(function () {
                  return writeFile(_path2.default.join(_this._pkgDir, '.node-red-config/enebular-agent-dynamic-deps/package.json'), (0, _stringify2.default)({
                    name: "enebular-agent-dynamic-deps",
                    version: "0.0.1",
                    dependencies: params.packages
                  }, null, 2));
                }).then(function () {
                  return _this.resolveDependency();
                }));

              case 2:
              case 'end':
                return _context2.stop();
            }
          }
        }, _callee2, this);
      }));

      function updatePackage(_x2) {
        return _ref3.apply(this, arguments);
      }

      return updatePackage;
    }()
  }, {
    key: 'resolveDependency',
    value: function () {
      var _ref4 = (0, _asyncToGenerator3.default)(_regenerator2.default.mark(function _callee3() {
        var _this2 = this;

        return _regenerator2.default.wrap(function _callee3$(_context3) {
          while (1) {
            switch (_context3.prev = _context3.next) {
              case 0:
                return _context3.abrupt('return', new _promise2.default(function (resolve, reject) {
                  var cproc = (0, _child_process.spawn)('npm', ['install', 'enebular-agent-dynamic-deps'], { stdio: 'inherit', cwd: _this2._pkgDir });
                  cproc.on('error', reject);
                  cproc.once('exit', resolve);
                }));

              case 1:
              case 'end':
                return _context3.stop();
            }
          }
        }, _callee3, this);
      }));

      function resolveDependency() {
        return _ref4.apply(this, arguments);
      }

      return resolveDependency;
    }()
  }, {
    key: 'startService',
    value: function () {
      var _ref5 = (0, _asyncToGenerator3.default)(_regenerator2.default.mark(function _callee4() {
        var _this3 = this;

        return _regenerator2.default.wrap(function _callee4$(_context4) {
          while (1) {
            switch (_context4.prev = _context4.next) {
              case 0:
                return _context4.abrupt('return', new _promise2.default(function (resolve, reject) {
                  _this3._cproc = (0, _child_process.spawn)(_this3._command, _this3._args, { stdio: 'inherit', cwd: _this3._pkgDir });
                  _this3._cproc.on('error', reject);
                  _this3._cproc.once('exit', resolve);
                }));

              case 1:
              case 'end':
                return _context4.stop();
            }
          }
        }, _callee4, this);
      }));

      function startService() {
        return _ref5.apply(this, arguments);
      }

      return startService;
    }()
  }, {
    key: 'shutdownService',
    value: function () {
      var _ref6 = (0, _asyncToGenerator3.default)(_regenerator2.default.mark(function _callee5() {
        var _this4 = this;

        return _regenerator2.default.wrap(function _callee5$(_context5) {
          while (1) {
            switch (_context5.prev = _context5.next) {
              case 0:
                return _context5.abrupt('return', new _promise2.default(function (resolve, reject) {
                  if (_this4._cproc) {
                    _this4._cproc.kill();
                    _this4._cproc.once('exit', function () {
                      _this4._cproc = null;
                      resolve();
                    });
                  } else {
                    resolve();
                  }
                }));

              case 1:
              case 'end':
                return _context5.stop();
            }
          }
        }, _callee5, this);
      }));

      function shutdownService() {
        return _ref6.apply(this, arguments);
      }

      return shutdownService;
    }()
  }, {
    key: 'restartService',
    value: function () {
      var _ref7 = (0, _asyncToGenerator3.default)(_regenerator2.default.mark(function _callee6() {
        return _regenerator2.default.wrap(function _callee6$(_context6) {
          while (1) {
            switch (_context6.prev = _context6.next) {
              case 0:
                _context6.next = 2;
                return this.shutdownService();

              case 2:
                _context6.next = 4;
                return this.startService();

              case 4:
              case 'end':
                return _context6.stop();
            }
          }
        }, _callee6, this);
      }));

      function restartService() {
        return _ref7.apply(this, arguments);
      }

      return restartService;
    }()
  }]);
  return EnebularAgent;
}();

exports.default = EnebularAgent;