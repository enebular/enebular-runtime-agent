/* @flow */

import winston from 'winston';

export default class LogManager {
  _transports: any;
  _loggers: any;

  constructor() {
    this._transports = {};
    this._transports['console'] = new (winston.transports.Console)({
      name: "console",
      colorize: true,
    });
    this._transports['enebularHTTP'] = new (winston.transports.File)({
      name: "enebularHTTP",
      filename: 'enebular-http-cache.log',
      json: true
    });
    this._transports['localFile'] = new (winston.transports.File)({
      name: "localFile",
      filename: 'enebular.log',
      json: false
    });
    this._loggers = new winston.Container({
      transports: [],
    });
  }

  addLogger(id: string, transports: any) {
    let options = {
      transports: [],
      rewriters: [
        function(level, msg, meta) {
          /* include the logger id in the meta as 'context' field */
          meta.context = id;
          return meta;
        }
      ]
    }
    transports = transports || ['console'];
    transports.forEach((transport) => {
      options.transports.push(this._transports[transport]);
    });
    return this._loggers.add(id, options);
  }

  getLogger(id: string) {
    return this._loggers.get(id);
  }
}
