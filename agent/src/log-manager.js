/* @flow */

import winston from 'winston';
import { Enebular } from './winston-enebular';

winston.transports.enebular = Enebular;

export type LogManagerConfig = {
  level? :string,
  enableConsole? :boolean,
  enableFile? :boolean,
  filePath? :string,
  enableEnebular? :boolean,
  enebularCachePath? :string,
  enebularMaxCacheSize?: number;
};

export default class LogManager {
  _transports: { [string]: winston.Transport };
  _loggers: winston.Container;
  _level :string;
  _enableConsole: boolean;
  _enableFile: boolean;
  _filePath: boolean;
  _enableEnebular: boolean;
  _enebularCachePath: string;
  _enebularTransport: winston.Transport = null;
  _enebularMaxCacheSize: number;

  constructor(config: LogManagerConfig) {

    const {
      level                 = 'info',
      enableConsole         = false,
      enableFile            = false,
      filePath              = "/var/log/enebular/enebular.log",
      enableEnebular        = true,
      enebularCachePath     = '/tmp/enebular-log-cache',
      enebularMaxCacheSize  = 5*1024*1024,
    } = config;
    this._level                 = level;
    this._enableConsole         = enableConsole;
    this._enableFile            = enableFile;
    this._filePath              = filePath;
    this._enableEnebular        = enableEnebular;
    this._enebularCachePath     = enebularCachePath;
    this._enebularMaxCacheSize  = enebularMaxCacheSize;

    this._transports = {};

    if (this._enableConsole) {
      this.addTransport(new (winston.transports.Console)({
        name: "console",
        level: this._level,
        colorize: true,
        formatter: (options) => {
          let output = '';
          if (options.meta) {
            output += options.meta.context ? (options.meta.context + ': ') : '';
            output += options.meta.module ? (options.meta.module + ': ') : '';
          }
          //output += options.level + ': ';
          output += options.message;
          return output;
        }
      }));
    }

    if (this._enableFile) {
      this.addTransport(new (winston.transports.File)({
        name: "file",
        level: this._level,
        filename: this._filePath,
        json: false
      }));
    }

    if (this._enableEnebular) {
      this._enebularTransport = new (winston.transports.enebular)({
        name: "enebular",
        level: this._level,
        cachePath: this._enebularCachePath,
        maxCacheSize: this._enebularMaxCacheSize
      });
      this.addTransport(this._enebularTransport);
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

  setEnebularAgentManager(agentManager: any) {
    if (this._enebularTransport) {
      this._enebularTransport.setAgentManager(agentManager);
    }
  }

  activateEnebular(active: boolean) {
    if (this._enebularTransport) {
      this._enebularTransport.activate(active);
    }
  }

  configureEnebular(options) {
    if (this._enebularTransport) {
      this._enebularTransport.configure(options);
    }
  }

  async shutdown() {
    this._loggers.close();
    if (this._enebularTransport) {
      await this._enebularTransport.cleanUp();
    }
  }
}
