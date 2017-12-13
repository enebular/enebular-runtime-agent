/* @flow */

import winston from 'winston';
import 'winston-logrotate';

export default class LogManager {
  _transports: any;
  _loggers: any;

  constructor() {
    this._transports = {};
    this._transports['console'] = new (winston.transports.Console)({
      name: "console",
      colorize: true,
    });
    this._transports['enebularHTTP'] = new winston.transports.Rotate({
      file: '/tmp/enebular-http-cache.log', // this path needs to be absolute
      timestamp: true,
      json: true,
      size: '10',
      keep: 100,
      compress: false
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
