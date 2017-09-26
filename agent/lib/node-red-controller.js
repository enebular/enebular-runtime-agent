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

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

var _isomorphicFetch = require('isomorphic-fetch');

var _isomorphicFetch2 = _interopRequireDefault(_isomorphicFetch);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 *
 */
var log = (0, _debug2.default)('enebular-runtime-agent:node-red-controller');

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
    this._actions = [];
    this._isProcessing = null;

    this._dir = dir;
    if (!_fs2.default.existsSync(this._dir)) {
      throw new Error('Given Node RED dir is not found: ' + this._dir);
    }
    if (!_fs2.default.existsSync(_path2.default.join(this._dir, 'package.json'))) {
      throw new Error('Given Node RED dir does not have package.json file : ' + this._dir);
    }
    this._command = command;
    this._registerHandler(emitter);
  }

  (0, _createClass3.default)(NodeREDController, [{
    key: '_registerHandler',
    value: function _registerHandler(emitter) {
      var _this = this;

      emitter.on('update-flow', function (params) {
        return _this.fetchAndUpdateFlow(params);
      });
      emitter.on('deploy', function (params) {
        return _this.fetchAndUpdateFlow(params);
      });
      emitter.on('start', function () {
        return _this.startService();
      });
      emitter.on('restart', function () {
        return _this.restartService();
      });
      emitter.on('shutdown', function () {
        return _this.shutdownService();
      });
    }
  }, {
    key: '_queueAction',
    value: function () {
      var _ref = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee(fn) {
        return _regenerator2.default.wrap(function _callee$(_context) {
          while (1) {
            switch (_context.prev = _context.next) {
              case 0:
                log('_queueAction');
                this._actions.push(fn);

                if (!this._isProcessing) {
                  _context.next = 7;
                  break;
                }

                _context.next = 5;
                return this._isProcessing;

              case 5:
                _context.next = 9;
                break;

              case 7:
                _context.next = 9;
                return this._processActions();

              case 9:
              case 'end':
                return _context.stop();
            }
          }
        }, _callee, this);
      }));

      function _queueAction(_x) {
        return _ref.apply(this, arguments);
      }

      return _queueAction;
    }()
  }, {
    key: '_processActions',
    value: function () {
      var _ref2 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee3() {
        var _this2 = this;

        return _regenerator2.default.wrap(function _callee3$(_context3) {
          while (1) {
            switch (_context3.prev = _context3.next) {
              case 0:
                log('_processActions', this._actions.length);
                this._isProcessing = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee2() {
                  var action;
                  return _regenerator2.default.wrap(function _callee2$(_context2) {
                    while (1) {
                      switch (_context2.prev = _context2.next) {
                        case 0:
                          if (!(_this2._actions.length > 0)) {
                            _context2.next = 6;
                            break;
                          }

                          action = _this2._actions.shift();
                          _context2.next = 4;
                          return action();

                        case 4:
                          _context2.next = 0;
                          break;

                        case 6:
                        case 'end':
                          return _context2.stop();
                      }
                    }
                  }, _callee2, _this2);
                }))();
                _context3.next = 4;
                return this._isProcessing;

              case 4:
                this._isProcessing = null;

              case 5:
              case 'end':
                return _context3.stop();
            }
          }
        }, _callee3, this);
      }));

      function _processActions() {
        return _ref2.apply(this, arguments);
      }

      return _processActions;
    }()
  }, {
    key: 'fetchAndUpdateFlow',
    value: function () {
      var _ref4 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee4(params) {
        var _this3 = this;

        return _regenerator2.default.wrap(function _callee4$(_context4) {
          while (1) {
            switch (_context4.prev = _context4.next) {
              case 0:
                return _context4.abrupt('return', this._queueAction(function () {
                  return _this3._fetchAndUpdateFlow(params);
                }));

              case 1:
              case 'end':
                return _context4.stop();
            }
          }
        }, _callee4, this);
      }));

      function fetchAndUpdateFlow(_x2) {
        return _ref4.apply(this, arguments);
      }

      return fetchAndUpdateFlow;
    }()
  }, {
    key: '_fetchAndUpdateFlow',
    value: function () {
      var _ref5 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee5(params) {
        return _regenerator2.default.wrap(function _callee5$(_context5) {
          while (1) {
            switch (_context5.prev = _context5.next) {
              case 0:
                log('_fetchAndUpdateFlow', params);
                _context5.next = 3;
                return this._downloadAndUpdatePackage(params.downloadUrl);

              case 3:
                _context5.next = 5;
                return this._restartService();

              case 5:
              case 'end':
                return _context5.stop();
            }
          }
        }, _callee5, this);
      }));

      function _fetchAndUpdateFlow(_x3) {
        return _ref5.apply(this, arguments);
      }

      return _fetchAndUpdateFlow;
    }()
  }, {
    key: '_downloadAndUpdatePackage',
    value: function () {
      var _ref6 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee6(downloadUrl) {
        var res, body;
        return _regenerator2.default.wrap(function _callee6$(_context6) {
          while (1) {
            switch (_context6.prev = _context6.next) {
              case 0:
                log('_downloadAndUpdatePackage', downloadUrl);
                _context6.next = 3;
                return (0, _isomorphicFetch2.default)(downloadUrl);

              case 3:
                res = _context6.sent;

                if (!(res.status >= 400)) {
                  _context6.next = 6;
                  break;
                }

                throw new Error('invalid url');

              case 6:
                _context6.next = 8;
                return res.json();

              case 8:
                body = _context6.sent;
                return _context6.abrupt('return', this._updatePackage(body));

              case 10:
              case 'end':
                return _context6.stop();
            }
          }
        }, _callee6, this);
      }));

      function _downloadAndUpdatePackage(_x4) {
        return _ref6.apply(this, arguments);
      }

      return _downloadAndUpdatePackage;
    }()
  }, {
    key: '_updatePackage',
    value: function () {
      var _ref7 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee7(flowPackage) {
        var _this4 = this;

        var updates, _flows, _creds;

        return _regenerator2.default.wrap(function _callee7$(_context7) {
          while (1) {
            switch (_context7.prev = _context7.next) {
              case 0:
                log('_updatePackage', flowPackage);
                updates = [];

                if (flowPackage.flow || flowPackage.flows) {
                  _flows = flowPackage.flow || flowPackage.flows;

                  updates.push(new _promise2.default(function (resolve, reject) {
                    var flowFilePath = _path2.default.join(_this4._dir, '.node-red-config', 'flows.json');
                    _fs2.default.writeFile(flowFilePath, (0, _stringify2.default)(_flows), function (err) {
                      return err ? reject(err) : resolve();
                    });
                  }));
                }
                if (flowPackage.cred || flowPackage.creds) {
                  _creds = flowPackage.cred || flowPackage.creds;

                  updates.push(new _promise2.default(function (resolve, reject) {
                    var credFilePath = _path2.default.join(_this4._dir, '.node-red-config', 'flows_cred.json');
                    _fs2.default.writeFile(credFilePath, (0, _stringify2.default)(_creds), function (err) {
                      return err ? reject(err) : resolve();
                    });
                  }));
                }
                if (flowPackage.packages) {
                  updates.push(new _promise2.default(function (resolve, reject) {
                    var packageJSONFilePath = _path2.default.join(_this4._dir, '.node-red-config', 'enebular-agent-dynamic-deps', 'package.json');
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
                _context7.next = 7;
                return _promise2.default.all(updates);

              case 7:
                _context7.next = 9;
                return this._resolveDependency();

              case 9:
              case 'end':
                return _context7.stop();
            }
          }
        }, _callee7, this);
      }));

      function _updatePackage(_x5) {
        return _ref7.apply(this, arguments);
      }

      return _updatePackage;
    }()
  }, {
    key: '_resolveDependency',
    value: function () {
      var _ref8 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee8() {
        var _this5 = this;

        return _regenerator2.default.wrap(function _callee8$(_context8) {
          while (1) {
            switch (_context8.prev = _context8.next) {
              case 0:
                return _context8.abrupt('return', new _promise2.default(function (resolve, reject) {
                  var cproc = (0, _child_process.spawn)('npm', ['install', 'enebular-agent-dynamic-deps'], { stdio: 'inherit', cwd: _this5._dir });
                  cproc.on('error', reject);
                  cproc.once('exit', resolve);
                }));

              case 1:
              case 'end':
                return _context8.stop();
            }
          }
        }, _callee8, this);
      }));

      function _resolveDependency() {
        return _ref8.apply(this, arguments);
      }

      return _resolveDependency;
    }()
  }, {
    key: 'startService',
    value: function () {
      var _ref9 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee9() {
        var _this6 = this;

        return _regenerator2.default.wrap(function _callee9$(_context9) {
          while (1) {
            switch (_context9.prev = _context9.next) {
              case 0:
                return _context9.abrupt('return', this._queueAction(function () {
                  return _this6._startService();
                }));

              case 1:
              case 'end':
                return _context9.stop();
            }
          }
        }, _callee9, this);
      }));

      function startService() {
        return _ref9.apply(this, arguments);
      }

      return startService;
    }()
  }, {
    key: '_startService',
    value: function () {
      var _ref10 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee10() {
        var _this7 = this;

        return _regenerator2.default.wrap(function _callee10$(_context10) {
          while (1) {
            switch (_context10.prev = _context10.next) {
              case 0:
                log('_startService');
                return _context10.abrupt('return', new _promise2.default(function (resolve, reject) {
                  var _command$split = _this7._command.split(/\s+/),
                      _command$split2 = (0, _toArray3.default)(_command$split),
                      command = _command$split2[0],
                      args = _command$split2.slice(1);

                  var cproc = (0, _child_process.spawn)(command, args, { stdio: 'inherit', cwd: _this7._dir });
                  cproc.once('exit', function (code) {
                    _this7._cproc = null;
                  });
                  cproc.once('error', function (err) {
                    _this7._cproc = null;
                    reject(err);
                  });
                  _this7._cproc = cproc;
                  setTimeout(function () {
                    return resolve();
                  }, 1000);
                }));

              case 2:
              case 'end':
                return _context10.stop();
            }
          }
        }, _callee10, this);
      }));

      function _startService() {
        return _ref10.apply(this, arguments);
      }

      return _startService;
    }()
  }, {
    key: 'shutdownService',
    value: function () {
      var _ref11 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee11() {
        var _this8 = this;

        return _regenerator2.default.wrap(function _callee11$(_context11) {
          while (1) {
            switch (_context11.prev = _context11.next) {
              case 0:
                return _context11.abrupt('return', this._queueAction(function () {
                  return _this8._shutdownService();
                }));

              case 1:
              case 'end':
                return _context11.stop();
            }
          }
        }, _callee11, this);
      }));

      function shutdownService() {
        return _ref11.apply(this, arguments);
      }

      return shutdownService;
    }()
  }, {
    key: '_shutdownService',
    value: function () {
      var _ref12 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee12() {
        var _this9 = this;

        return _regenerator2.default.wrap(function _callee12$(_context12) {
          while (1) {
            switch (_context12.prev = _context12.next) {
              case 0:
                log('_shutdownService');
                return _context12.abrupt('return', new _promise2.default(function (resolve, reject) {
                  var cproc = _this9._cproc;
                  if (cproc) {
                    cproc.kill();
                    cproc.once('exit', function () {
                      _this9._cproc = null;
                      resolve();
                    });
                  } else {
                    resolve();
                  }
                }));

              case 2:
              case 'end':
                return _context12.stop();
            }
          }
        }, _callee12, this);
      }));

      function _shutdownService() {
        return _ref12.apply(this, arguments);
      }

      return _shutdownService;
    }()
  }, {
    key: 'restartService',
    value: function () {
      var _ref13 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee13() {
        var _this10 = this;

        return _regenerator2.default.wrap(function _callee13$(_context13) {
          while (1) {
            switch (_context13.prev = _context13.next) {
              case 0:
                return _context13.abrupt('return', this._queueAction(function () {
                  return _this10._restartService();
                }));

              case 1:
              case 'end':
                return _context13.stop();
            }
          }
        }, _callee13, this);
      }));

      function restartService() {
        return _ref13.apply(this, arguments);
      }

      return restartService;
    }()
  }, {
    key: '_restartService',
    value: function () {
      var _ref14 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee14() {
        return _regenerator2.default.wrap(function _callee14$(_context14) {
          while (1) {
            switch (_context14.prev = _context14.next) {
              case 0:
                log('_restartService');
                _context14.next = 3;
                return this._shutdownService();

              case 3:
                _context14.next = 5;
                return this._startService();

              case 5:
              case 'end':
                return _context14.stop();
            }
          }
        }, _callee14, this);
      }));

      function _restartService() {
        return _ref14.apply(this, arguments);
      }

      return _restartService;
    }()
  }, {
    key: 'getStatus',
    value: function getStatus() {
      if (this._cproc) {
        log('getStatus started ==========');
        return 'connected';
      } else {
        log('getStatus stopped ==========');
        return 'disconnected';
      }
    }
  }]);
  return NodeREDController;
}();

exports.default = NodeREDController;