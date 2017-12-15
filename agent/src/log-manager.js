/* @flow */

import winston from 'winston';
import 'winston-logrotate';

/**
 *
 */
export type LogManagerConfig = {
  enableConsole? :boolean,
  enableFile? :boolean,
  filePath? :boolean,
  enableEnebularHTTP? :boolean,
};

export default class LogManager {
  _transports: { [string]: winston.Transport };
  _loggers: winston.Container;
  _enableConsole: boolean;
  _enableFile: boolean;
  _filePath: boolean;
  _enableEnebularHTTP: boolean;

  constructor(config: LogManagerConfig) {

    const {
      enableConsole = true,
      enableFile = false,
      filePath = "/var/log/enebular/enebular.log",
      enableEnebularHTTP = true,
    } = config;
    this._enableConsole = enableConsole;
    this._enableFile = enableFile;
    this._filePath = filePath;
    this._enableEnebularHTTP = enableEnebularHTTP;

    this._transports = {};

    if (this._enableConsole) {
      this.addTransport(new (winston.transports.Console)({
        name: "console",
        colorize: true,
      }));
    }

    if (this._enableFile) {
      this.addTransport(new (winston.transports.File)({
        name: "file",
        filename: this._filePath,
        json: false
      }));
    }

    if (this._enableEnebularHTTP) {
      this.addTransport(new winston.transports.Rotate({
        name: "enebularHTTP",
        file: '/tmp/enebular-http-log-cache/enebular-http-log-cache.log', // this path needs to be absolute
        timestamp: true,
        json: true,
        size: '500',
        keep: 100,
        compress: false
      }));
    }

    this._loggers = new winston.Container({
      //
    });

  }

  addTransport(transport: winston.Transport) {
    const id = transport.name;
    if (this._transports[id]) {
      throw new Error("Attempted to add duplicate transport name: " + id);
    }
    this._transports[id] = transport;
  }

  addLogger(id: string, transports: ?string[]): winston.Logger {
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
      if (this._transports[transport]) {
        options.transports.push(this._transports[transport]);
      }
    });
    return this._loggers.add(id, options);
  }

  getLogger(id: string): winston.Logger {
    return this._loggers.get(id);
  }

  shutdown() {
    this._loggers.close();
  }
}
