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


var readDirAsync = (0, _util.promisify)(_fs2.default.readdir);
var readFileAsync = (0, _util.promisify)(_fs2.default.readFile);
var writeFileAsync = (0, _util.promisify)(_fs2.default.writeFile);
var appendFileAsync = (0, _util.promisify)(_fs2.default.appendFile);
var statAsync = (0, _util.promisify)(_fs2.default.stat);
var unlinkAsync = (0, _util.promisify)(_fs2.default.unlink);
/**
 *
 */

var AgentManagerMediator = function (_EventEmitter) {
  (0, _inherits3.default)(AgentManagerMediator, _EventEmitter);

  function AgentManagerMediator(nodeRed) {
    (0, _classCallCheck3.default)(this, AgentManagerMediator);

    var _this = (0, _possibleConstructorReturn3.default)(this, (AgentManagerMediator.__proto__ || (0, _getPrototypeOf2.default)(AgentManagerMediator)).call(this));

    _this._nodeRed = nodeRed;
    process.on('SIGINT', function () {
      _this.cleanUp();
    });
    process.on('uncaughtException', function () {
      _this.cleanUp();
    });
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
    key: 'recordLogs',
    value: function () {
      var _ref = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee() {
        var baseUrl, accessToken, logList, destinationFile, logsToConcatenate, _iteratorNormalCompletion, _didIteratorError, _iteratorError, _iterator, _step, filename, fileContent, stats, fileSize, destinationFileStats, form, res, message, err;

        return _regenerator2.default.wrap(function _callee$(_context) {
          while (1) {
            switch (_context.prev = _context.next) {
              case 0:
                _context.prev = 0;
                baseUrl = this._baseUrl, accessToken = this._accessToken;
                // batch logs

                logList = _fs2.default.readdirSync('logs/logs');
                // on some systems .DS_Store is created so 

                if (!(logList[0] === '.DS_Store' || logList[logList.length - 1] === '.DS_Store')) {
                  _context.next = 7;
                  break;
                }

                _context.next = 6;
                return unlinkAsync('logs/logs/.DS_Store');

              case 6:
                logList = logList.slice(1);

              case 7:
                if (logList.length) {
                  _context.next = 9;
                  break;
                }

                return _context.abrupt('return');

              case 9:
                destinationFile = logList[0];
                logsToConcatenate = logList.slice(1);
                // concatenate existing logs into the oldest existing log file

                _iteratorNormalCompletion = true;
                _didIteratorError = false;
                _iteratorError = undefined;
                _context.prev = 14;
                _iterator = (0, _getIterator3.default)(logsToConcatenate);

              case 16:
                if (_iteratorNormalCompletion = (_step = _iterator.next()).done) {
                  _context.next = 37;
                  break;
                }

                filename = _step.value;
                _context.next = 20;
                return readFileAsync('logs/logs/' + filename, 'utf8');

              case 20:
                fileContent = _context.sent;
                _context.next = 23;
                return statAsync('logs/logs/' + filename);

              case 23:
                stats = _context.sent;
                fileSize = stats.size;

                if (fileSize) {
                  _context.next = 30;
                  break;
                }

                _context.next = 28;
                return unlinkAsync('logs/logs/' + filename);

              case 28:
                _context.next = 34;
                break;

              case 30:
                _context.next = 32;
                return appendFileAsync('logs/logs/' + destinationFile, fileContent);

              case 32:
                _context.next = 34;
                return unlinkAsync('logs/logs/' + filename);

              case 34:
                _iteratorNormalCompletion = true;
                _context.next = 16;
                break;

              case 37:
                _context.next = 43;
                break;

              case 39:
                _context.prev = 39;
                _context.t0 = _context['catch'](14);
                _didIteratorError = true;
                _iteratorError = _context.t0;

              case 43:
                _context.prev = 43;
                _context.prev = 44;

                if (!_iteratorNormalCompletion && _iterator.return) {
                  _iterator.return();
                }

              case 46:
                _context.prev = 46;

                if (!_didIteratorError) {
                  _context.next = 49;
                  break;
                }

                throw _iteratorError;

              case 49:
                return _context.finish(46);

              case 50:
                return _context.finish(43);

              case 51:
                _context.next = 53;
                return statAsync('logs/logs/' + destinationFile);

              case 53:
                destinationFileStats = _context.sent;

                if (destinationFileStats.size) {
                  _context.next = 58;
                  break;
                }

                log('_recordLogs: delete accumulated file size 0');
                _context.next = 58;
                return unlinkAsync('logs/logs/' + destinationFile);

              case 58:
                log('_recordLogs: done batching');

                // post logs
                form = new _formData2.default();

                form.append(destinationFile, _fs2.default.createReadStream('logs/logs/' + destinationFile));
                _context.next = 63;
                return (0, _isomorphicFetch2.default)(baseUrl + '/record-logs', {
                  method: 'POST',
                  headers: {
                    'Authorization': 'Bearer ' + accessToken
                  },
                  body: form
                });

              case 63:
                res = _context.sent;

                if (res.ok) {
                  _context.next = 72;
                  break;
                }

                _context.next = 67;
                return res.text();

              case 67:
                message = _context.sent;
                err = new Error('Cannot record logs to agent manager: ');

                this.emit('error', message);
                _context.next = 75;
                break;

              case 72:
                log('_recordLogs: delete after successful post');
                _context.next = 75;
                return unlinkAsync('logs/logs/' + destinationFile);

              case 75:
                _context.next = 80;
                break;

              case 77:
                _context.prev = 77;
                _context.t1 = _context['catch'](0);

                console.error('_recordLog error', _context.t1);

              case 80:
              case 'end':
                return _context.stop();
            }
          }
        }, _callee, this, [[0, 77], [14, 39, 43, 51], [44,, 46, 50]]);
      }));

      function recordLogs() {
        return _ref.apply(this, arguments);
      }

      return recordLogs;
    }()
  }, {
    key: 'notifyStatus',
    value: function () {
      var _ref2 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee2(kill) {
        var baseUrl, accessToken, status, res, message, err;
        return _regenerator2.default.wrap(function _callee2$(_context2) {
          while (1) {
            switch (_context2.prev = _context2.next) {
              case 0:
                baseUrl = this._baseUrl, accessToken = this._accessToken;
                status = kill ? 'disconnected' : this._nodeRed.getStatus();

                console.log('*** send status notification ***', status);
                _context2.next = 5;
                return (0, _isomorphicFetch2.default)(baseUrl + '/notify-status', {
                  method: 'POST',
                  headers: {
                    'Authorization': 'Bearer ' + accessToken,
                    'Content-Type': 'application/json'
                  },
                  body: (0, _stringify2.default)({ status: status })
                });

              case 5:
                res = _context2.sent;

                if (res.ok) {
                  _context2.next = 12;
                  break;
                }

                _context2.next = 9;
                return res.text();

              case 9:
                message = _context2.sent;
                err = new Error('Cannot notify status to agent manager: ');

                this.emit('error', err);

              case 12:
                kill ? this.exitStatusReport() : null;

              case 13:
              case 'end':
                return _context2.stop();
            }
          }
        }, _callee2, this);
      }));

      function notifyStatus(_x) {
        return _ref2.apply(this, arguments);
      }

      return notifyStatus;
    }()
  }, {
    key: 'cleanUp',
    value: function () {
      var _ref3 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee3() {
        return _regenerator2.default.wrap(function _callee3$(_context3) {
          while (1) {
            switch (_context3.prev = _context3.next) {
              case 0:
                log('_cleanUp');
                clearInterval(this._pid);
                clearInterval(this._logInterval);
                this._nodeRed._stdoutUnhook;
                this._nodeRed._stderrUnhook;
                _context3.next = 7;
                return this.notifyStatus(true);

              case 7:
                _context3.next = 9;
                return this.recordLogs();

              case 9:
              case 'end':
                return _context3.stop();
            }
          }
        }, _callee3, this);
      }));

      function cleanUp() {
        return _ref3.apply(this, arguments);
      }

      return cleanUp;
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
      this.notifyStatus();
      this._pid = setInterval(function () {
        return _this2.notifyStatus();
      }, 10000);
    }
  }, {
    key: 'startLogReport',
    value: function startLogReport() {
      var _this3 = this;

      log('startLogReport');
      var baseUrl = this._baseUrl,
          accessToken = this._accessToken;

      if (!baseUrl || !accessToken) {
        log('Cannnot start log report without baseUrl or access Token.');
        return;
      }
      this._logInterval = setInterval(function () {
        return _this3.recordLogs();
      }, 10000);
    }
  }]);
  return AgentManagerMediator;
}(_events2.default);

exports.default = AgentManagerMediator;