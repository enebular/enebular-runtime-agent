'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _toArray2 = require('babel-runtime/helpers/toArray');

var _toArray3 = _interopRequireDefault(_toArray2);

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

var _events = require('events');

var _events2 = _interopRequireDefault(_events);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _child_process = require('child_process');

var _isomorphicFetch = require('isomorphic-fetch');

var _isomorphicFetch2 = _interopRequireDefault(_isomorphicFetch);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 *
 */


/**
 *
 */
var NodeREDController = function () {
  function NodeREDController(dir, command, emitter) {
    (0, _classCallCheck3.default)(this, NodeREDController);
    this._cproc = null;

    this._dir = dir;
    this._command = command;
    this._isProcessingActions = false;
    this._actions = [];
    this._registerHandler(emitter);
  }

  (0, _createClass3.default)(NodeREDController, [{
    key: '_registerHandler',
    value: function _registerHandler(emitter) {
      var _this = this;

      emitter.on('update-flow', function (params) {
        return _this._queueAction(function () {
          return _this._fetchAndUpdateFlow(params);
        });
      });
      emitter.on('deploy', function (params) {
        return _this._queueAction(function () {
          return _this._fetchAndUpdateFlow(params);
        });
      });
      emitter.on('restart', function () {
        return _this._queueAction(function () {
          return _this._restartService();
        });
      });
      emitter.on('shutdown', function () {
        return _this._queueAction(function () {
          return _this._shutdownService();
        });
      });
    }
  }, {
    key: '_queueAction',
    value: function _queueAction(fn) {
      this._actions.push(fn);
      if (!this._isProcessingActions) {
        this._processActions();
      }
    }
  }, {
    key: '_processActions',
    value: function () {
      var _ref = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee() {
        var action;
        return _regenerator2.default.wrap(function _callee$(_context) {
          while (1) {
            switch (_context.prev = _context.next) {
              case 0:
                this._isProcessingActions = true;

              case 1:
                if (!(this._actions.length > 0)) {
                  _context.next = 7;
                  break;
                }

                action = this._actions.shift();
                _context.next = 5;
                return action();

              case 5:
                _context.next = 1;
                break;

              case 7:
                this._isProcessingActions = false;

              case 8:
              case 'end':
                return _context.stop();
            }
          }
        }, _callee, this);
      }));

      function _processActions() {
        return _ref.apply(this, arguments);
      }

      return _processActions;
    }()
  }, {
    key: '_fetchAndUpdateFlow',
    value: function () {
      var _ref2 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee2(params) {
        return _regenerator2.default.wrap(function _callee2$(_context2) {
          while (1) {
            switch (_context2.prev = _context2.next) {
              case 0:
                _context2.next = 2;
                return this._downloadAndUpdatePackage(params.downloadUrl);

              case 2:
                _context2.next = 4;
                return this._restartService();

              case 4:
              case 'end':
                return _context2.stop();
            }
          }
        }, _callee2, this);
      }));

      function _fetchAndUpdateFlow(_x) {
        return _ref2.apply(this, arguments);
      }

      return _fetchAndUpdateFlow;
    }()
  }, {
    key: '_downloadAndUpdatePackage',
    value: function () {
      var _ref3 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee3(downloadUrl) {
        var res, body;
        return _regenerator2.default.wrap(function _callee3$(_context3) {
          while (1) {
            switch (_context3.prev = _context3.next) {
              case 0:
                _context3.next = 2;
                return (0, _isomorphicFetch2.default)(downloadUrl);

              case 2:
                res = _context3.sent;

                if (!(res.status >= 400)) {
                  _context3.next = 5;
                  break;
                }

                throw new Error('invalid url');

              case 5:
                _context3.next = 7;
                return res.json();

              case 7:
                body = _context3.sent;
                return _context3.abrupt('return', this._updatePackage(body));

              case 9:
              case 'end':
                return _context3.stop();
            }
          }
        }, _callee3, this);
      }));

      function _downloadAndUpdatePackage(_x2) {
        return _ref3.apply(this, arguments);
      }

      return _downloadAndUpdatePackage;
    }()
  }, {
    key: '_updatePackage',
    value: function () {
      var _ref4 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee4(flowPackage) {
        var _this2 = this;

        var updates, _flows, _creds;

        return _regenerator2.default.wrap(function _callee4$(_context4) {
          while (1) {
            switch (_context4.prev = _context4.next) {
              case 0:
                updates = [];

                if (flowPackage.flow || flowPackage.flows) {
                  _flows = flowPackage.flow || flowPackage.flows;

                  updates.push(new _promise2.default(function (resolve, reject) {
                    var flowFilePath = _path2.default.join(_this2._dir, '.node-red-config', 'flows.json');
                    _fs2.default.writeFile(flowFilePath, (0, _stringify2.default)(_flows), function (err) {
                      return err ? reject(err) : resolve();
                    });
                  }));
                }
                if (flowPackage.cred || flowPackage.creds) {
                  _creds = flowPackage.cred || flowPackage.creds;

                  updates.push(new _promise2.default(function (resolve, reject) {
                    var credFilePath = _path2.default.join(_this2._dir, '.node-red-config', 'flows_cred.json');
                    _fs2.default.writeFile(credFilePath, (0, _stringify2.default)(_creds), function (err) {
                      return err ? reject(err) : resolve();
                    });
                  }));
                }
                if (flowPackage.packages) {
                  updates.push(new _promise2.default(function (resolve, reject) {
                    var packageJSONFilePath = _path2.default.join(_this2._dir, '.node-red-config', 'enebular-agent-dynamic-deps', 'package.json');
                    var packageJSON = (0, _stringify2.default)({
                      name: 'enebular-agent-dynamic-deps',
                      version: '0.0.1',
                      dependencies: flowPackage.packages
                    }, null, 2);
                    _fs2.default.writeFile(packageJSONFilePath, packageJSON, function (err) {
                      return err ? reject(err) : resolve();
                    });
                  }));
                }
                _context4.next = 6;
                return _promise2.default.all(updates);

              case 6:
                _context4.next = 8;
                return this._resolveDependency();

              case 8:
              case 'end':
                return _context4.stop();
            }
          }
        }, _callee4, this);
      }));

      function _updatePackage(_x3) {
        return _ref4.apply(this, arguments);
      }

      return _updatePackage;
    }()
  }, {
    key: '_resolveDependency',
    value: function () {
      var _ref5 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee5() {
        var _this3 = this;

        return _regenerator2.default.wrap(function _callee5$(_context5) {
          while (1) {
            switch (_context5.prev = _context5.next) {
              case 0:
                return _context5.abrupt('return', new _promise2.default(function (resolve, reject) {
                  var cproc = (0, _child_process.spawn)('npm', ['install', 'enebular-agent-dynamic-deps'], { stdio: 'inherit', cwd: _this3._dir });
                  cproc.on('error', reject);
                  cproc.once('exit', resolve);
                }));

              case 1:
              case 'end':
                return _context5.stop();
            }
          }
        }, _callee5, this);
      }));

      function _resolveDependency() {
        return _ref5.apply(this, arguments);
      }

      return _resolveDependency;
    }()
  }, {
    key: '_startService',
    value: function () {
      var _ref6 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee6() {
        var _this4 = this;

        return _regenerator2.default.wrap(function _callee6$(_context6) {
          while (1) {
            switch (_context6.prev = _context6.next) {
              case 0:
                return _context6.abrupt('return', new _promise2.default(function (resolve, reject) {
                  var _command$split = _this4._command.split(/\s+/),
                      _command$split2 = (0, _toArray3.default)(_command$split),
                      command = _command$split2[0],
                      args = _command$split2.slice(1);

                  var cproc = (0, _child_process.spawn)(command, args, { stdio: 'inherit', cwd: _this4._dir });
                  cproc.on('error', reject);
                  cproc.once('exit', resolve);
                  _this4._cproc = cproc;
                }));

              case 1:
              case 'end':
                return _context6.stop();
            }
          }
        }, _callee6, this);
      }));

      function _startService() {
        return _ref6.apply(this, arguments);
      }

      return _startService;
    }()
  }, {
    key: '_shutdownService',
    value: function () {
      var _ref7 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee7() {
        var _this5 = this;

        return _regenerator2.default.wrap(function _callee7$(_context7) {
          while (1) {
            switch (_context7.prev = _context7.next) {
              case 0:
                return _context7.abrupt('return', new _promise2.default(function (resolve, reject) {
                  var cproc = _this5._cproc;
                  if (cproc) {
                    cproc.kill();
                    cproc.once('exit', function () {
                      _this5._cproc = null;
                      resolve();
                    });
                  } else {
                    resolve();
                  }
                }));

              case 1:
              case 'end':
                return _context7.stop();
            }
          }
        }, _callee7, this);
      }));

      function _shutdownService() {
        return _ref7.apply(this, arguments);
      }

      return _shutdownService;
    }()
  }, {
    key: '_restartService',
    value: function () {
      var _ref8 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee8() {
        return _regenerator2.default.wrap(function _callee8$(_context8) {
          while (1) {
            switch (_context8.prev = _context8.next) {
              case 0:
                _context8.next = 2;
                return this._shutdownService();

              case 2:
                _context8.next = 4;
                return this._startService();

              case 4:
              case 'end':
                return _context8.stop();
            }
          }
        }, _callee8, this);
      }));

      function _restartService() {
        return _ref8.apply(this, arguments);
      }

      return _restartService;
    }()
  }]);
  return NodeREDController;
}();

exports.default = NodeREDController;