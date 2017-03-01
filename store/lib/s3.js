'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _assign = require('babel-runtime/core-js/object/assign');

var _assign2 = _interopRequireDefault(_assign);

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

var _regenerator = require('babel-runtime/regenerator');

var _regenerator2 = _interopRequireDefault(_regenerator);

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

var _awsSdk = require('aws-sdk');

var _awsSdk2 = _interopRequireDefault(_awsSdk);

var _uuid = require('uuid');

var _uuid2 = _interopRequireDefault(_uuid);

var _ = require('.');

var _2 = _interopRequireDefault(_);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 *
 */
var S3Store = function (_PackageStore) {
  (0, _inherits3.default)(S3Store, _PackageStore);

  function S3Store(_ref) {
    var awsAccessKeyId = _ref.awsAccessKeyId,
        awsSecretAccessKey = _ref.awsSecretAccessKey,
        s3BucketName = _ref.s3BucketName,
        s3BaseKey = _ref.s3BaseKey,
        s3ExpirySec = _ref.s3ExpirySec;
    (0, _classCallCheck3.default)(this, S3Store);

    var _this = (0, _possibleConstructorReturn3.default)(this, (S3Store.__proto__ || (0, _getPrototypeOf2.default)(S3Store)).call(this));

    _this._awsAccessKeyId = awsAccessKeyId;
    _this._awsSecretAccessKey = awsSecretAccessKey;
    _this._s3BucketName = s3BucketName;
    _this._s3BaseKey = s3BaseKey;
    _this._s3ExpirySec = s3ExpirySec || 60;
    return _this;
  }

  (0, _createClass3.default)(S3Store, [{
    key: 'savePackage',
    value: function () {
      var _ref2 = (0, _asyncToGenerator3.default)(_regenerator2.default.mark(function _callee(data) {
        var s3, ret;
        return _regenerator2.default.wrap(function _callee$(_context) {
          while (1) {
            switch (_context.prev = _context.next) {
              case 0:
                s3 = new _awsSdk2.default.S3({
                  accessKeyId: this._awsAccessKeyId,
                  secretAccessKey: this._awsSecretAccessKey
                });
                _context.next = 3;
                return this.uploadToS3(s3, data);

              case 3:
                ret = _context.sent;
                return _context.abrupt('return', this.getSignedDownloadUrl(s3, ret.Key, { Expires: this._s3ExpirySec }));

              case 5:
              case 'end':
                return _context.stop();
            }
          }
        }, _callee, this);
      }));

      function savePackage(_x) {
        return _ref2.apply(this, arguments);
      }

      return savePackage;
    }()
  }, {
    key: 'uploadToS3',
    value: function () {
      var _ref3 = (0, _asyncToGenerator3.default)(_regenerator2.default.mark(function _callee2(s3, data) {
        var _this2 = this;

        return _regenerator2.default.wrap(function _callee2$(_context2) {
          while (1) {
            switch (_context2.prev = _context2.next) {
              case 0:
                return _context2.abrupt('return', new _promise2.default(function (resolve, reject) {
                  var Key = _this2._s3BaseKey + '/' + (0, _uuid2.default)() + '.json';
                  s3.putObject({
                    Bucket: _this2._s3BucketName,
                    ACL: 'private',
                    Key: Key,
                    Body: data
                  }, function (err, ret) {
                    if (err) {
                      return reject(err);
                    }
                    return resolve({ Key: Key });
                  });
                }));

              case 1:
              case 'end':
                return _context2.stop();
            }
          }
        }, _callee2, this);
      }));

      function uploadToS3(_x2, _x3) {
        return _ref3.apply(this, arguments);
      }

      return uploadToS3;
    }()
  }, {
    key: 'getSignedDownloadUrl',
    value: function () {
      var _ref4 = (0, _asyncToGenerator3.default)(_regenerator2.default.mark(function _callee3(s3, key, options) {
        var _this3 = this;

        return _regenerator2.default.wrap(function _callee3$(_context3) {
          while (1) {
            switch (_context3.prev = _context3.next) {
              case 0:
                return _context3.abrupt('return', new _promise2.default(function (resolve, reject) {
                  s3.getSignedUrl('getObject', (0, _assign2.default)({
                    Bucket: _this3._s3BucketName,
                    Key: key
                  }, options), function (err, url) {
                    if (err) {
                      return reject(err);
                    }
                    return resolve(url);
                  });
                }));

              case 1:
              case 'end':
                return _context3.stop();
            }
          }
        }, _callee3, this);
      }));

      function getSignedDownloadUrl(_x4, _x5, _x6) {
        return _ref4.apply(this, arguments);
      }

      return getSignedDownloadUrl;
    }()
  }]);
  return S3Store;
}(_2.default);

exports.default = S3Store;