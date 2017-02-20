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

var _classCallCheck2 = require('babel-runtime/helpers/classCallCheck');

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require('babel-runtime/helpers/createClass');

var _createClass3 = _interopRequireDefault(_createClass2);

var _archiver = require('archiver');

var _archiver2 = _interopRequireDefault(_archiver);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var PackageStore = function () {
  function PackageStore() {
    (0, _classCallCheck3.default)(this, PackageStore);
  }

  (0, _createClass3.default)(PackageStore, [{
    key: 'createPackage',
    value: function () {
      var _ref = (0, _asyncToGenerator3.default)(_regenerator2.default.mark(function _callee(params) {
        var archive;
        return _regenerator2.default.wrap(function _callee$(_context) {
          while (1) {
            switch (_context.prev = _context.next) {
              case 0:
                archive = (0, _archiver2.default)('zip');

                if (params.flows) {
                  archive.append((0, _stringify2.default)(params.flows), { name: '.node-red-config/flows.json' });
                }
                if (params.creds) {
                  archive.append((0, _stringify2.default)(params.creds), { name: '.node-red-config/flows_cred.json' });
                }
                if (params.packages) {
                  archive.append((0, _stringify2.default)({
                    dependencies: params.packages
                  }), { name: '.node-red-config/dynamic-deps/package.json' });
                }
                archive.finalize();
                return _context.abrupt('return', this.savePackage(archive));

              case 6:
              case 'end':
                return _context.stop();
            }
          }
        }, _callee, this);
      }));

      function createPackage(_x) {
        return _ref.apply(this, arguments);
      }

      return createPackage;
    }()
  }, {
    key: 'savePackage',
    value: function () {
      var _ref2 = (0, _asyncToGenerator3.default)(_regenerator2.default.mark(function _callee2(pkgStream) {
        return _regenerator2.default.wrap(function _callee2$(_context2) {
          while (1) {
            switch (_context2.prev = _context2.next) {
              case 0:
                return _context2.abrupt('return', pkgStream);

              case 1:
              case 'end':
                return _context2.stop();
            }
          }
        }, _callee2, this);
      }));

      function savePackage(_x2) {
        return _ref2.apply(this, arguments);
      }

      return savePackage;
    }()
  }]);
  return PackageStore;
}();

exports.default = PackageStore;