/* @flow */

import winston from 'winston';
import { Enebular } from './winston-enebular';

winston.transports.enebular = Enebular;

export type LogManagerConfig = {
  enableConsole? :boolean,
  enableFile? :boolean,
  filePath? :boolean,
  enableEnebular? :boolean,
};

export default class LogManager {
  _transports: { [string]: winston.Transport };
  _loggers: winston.Container;
  _enableConsole: boolean;
  _enableFile: boolean;
  _filePath: boolean;
  _enableEnebular: boolean;

  constructor(config: LogManagerConfig) {

    const {
      enableConsole = true,
      enableFile = false,
      filePath = "/var/log/enebular/enebular.log",
      enableEnebular = true,
    } = config;
    this._enableConsole = enableConsole;
    this._enableFile = enableFile;
    this._filePath = filePath;
    this._enableEnebular = enableEnebular;

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

    if (this._enableEnebular) {
      this.addTransport(new (winston.transports.enebular)({
        name: "enebular",
        cachePath: '/tmp/enebular-log-cache',
        todo: true
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
