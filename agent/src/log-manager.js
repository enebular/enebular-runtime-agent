/* @flow */

import winston from 'winston';

export default class LogManager {
  _transports: any;
  _loggers: any;

  constructor() {
    this._transports = {};
    this._transports['console'] = new (winston.transports.Console)({
      name: "console"
    });
    this._transports['httpCache'] = new (winston.transports.File)({
      name: "httpCache",
      filename: 'httpCache.log',
      json: true
    });
    this._transports['localFile'] = new (winston.transports.File)({
      name: "localFile",
      filename: 'enebular.log',
      json: false
    });
    this._loggers = new winston.Container({
      transports: [this._transports['console']],
    });
  }

  addLogger(id: string, transports: any) {
    let logger = this._loggers.add(id, {
      rewriters: [
        function(level, msg, meta) {
          /* include the logger id in the meta as 'context' field */
          meta.context = id;
          return meta;
        }
      ]
    });
    transports.forEach((transport) => {
      logger.add(this._transports[transport], {}, true);
    });
    return logger;
  }

  getLogger(id: string) {
    return this._loggers.get(id);
  }
}
