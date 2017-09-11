'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _classCallCheck2 = require('babel-runtime/helpers/classCallCheck');

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require('babel-runtime/helpers/createClass');

var _createClass3 = _interopRequireDefault(_createClass2);

var _isomorphicFetch = require('isomorphic-fetch');

var _isomorphicFetch2 = _interopRequireDefault(_isomorphicFetch);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 *
 */
var AgentManagerMediator = function () {
  function AgentManagerMediator() {
    (0, _classCallCheck3.default)(this, AgentManagerMediator);
  }

  (0, _createClass3.default)(AgentManagerMediator, [{
    key: 'setBaseUrl',
    value: function setBaseUrl(baseUrl) {
      this._baseUrl = baseUrl;
    }
  }, {
    key: 'setAccessToken',
    value: function setAccessToken(accessToken) {
      this._accessToken = accessToken;
    }
  }, {
    key: 'startStatusReport',
    value: function startStatusReport() {}
  }]);
  return AgentManagerMediator;
}();

exports.default = AgentManagerMediator;