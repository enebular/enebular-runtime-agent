/* @flow */

import winston from 'winston'
import { Syslog } from 'winston-syslog'
import Config from './config'
import { Enebular } from './winston-enebular'
import type { WinstonEnebularConfig } from './winston-enebular'
import type AgentManagerMediator from './agent-manager-mediator'

export type LogManagerConfig = {
  level?: string,
  enableConsole?: boolean,
  enableFile?: boolean,
  filePath?: string,
  enableEnebular?: boolean,
  enebularCachePath?: string,
  enebularMaxCacheSize?: number,
  enebularMaxSizePerInterval?: number
}

export default class LogManager {
  _transports: { [string]: winston.Transport }
  _loggers: winston.Container
  _enebularTransport: winston.Transport = null

  constructor(config: LogManagerConfig) {
    const {
      level = 'info',
      enableConsole = false,
      enableFile = false,
      enableSysLog = Config.ENABLE_SYSLOG,
      filePath = '/var/log/enebular/enebular.log',
      enableEnebular = true,
      enebularCachePath = '/tmp/enebular-log-cache',
      enebularMaxCacheSize = 2 * 1024 * 1024,
      enebularMaxSizePerInterval = 10 * 1024,
      enebularSendInterval = 30
    } = config

    this._transports = {}

    if (enableConsole) {
      this.addTransport(
        new winston.transports.Console({
          name: 'console',
          level: level,
          colorize: true,
          handleExceptions: true,
          humanReadableUnhandledException: true,
          formatter: options => {
            let output = ''
            if (options.meta) {
              if (options.meta.context) {
                output += options.meta.context + ': '
                delete options.meta.context
              }
              if (options.meta.module) {
                output += options.meta.module + ': '
                delete options.meta.module
              }
            }
            output += options.message
            // output += ' (' + options.level + ')';
            if (options.meta && Object.keys(options.meta).length > 0) {
              output += ' ' + JSON.stringify(options.meta)
            }
            return output
          }
        })
      )
    }

    if (enableFile) {
      this.addTransport(
        new winston.transports.File({
          name: 'file',
          level: level,
          filename: filePath,
          handleExceptions: true,
          json: false
        })
      )
    }

    if (enableSysLog) {
      this.addTransport(
        new Syslog({
          name: 'syslog',
          level: level,
          app_name: 'enebular-agent',
          protocol: 'unix',
          path: '/dev/log'
        })
      )
    }

    if (enableEnebular) {
      this._enebularTransport = new Enebular({
        name: 'enebular',
        level: level,
        handleExceptions: true,
        cachePath: enebularCachePath,
        maxCacheSize: enebularMaxCacheSize,
        maxSizePerInterval: enebularMaxSizePerInterval,
        sendInterval: enebularSendInterval
      })
      this.addTransport(this._enebularTransport)
    }

    this._loggers = new winston.Container({
      //
    })
  }

  addTransport(transport: winston.Transport) {
    const id = transport.name
    if (this._transports[id]) {
      throw new Error('Attempted to add duplicate transport name: ' + id)
    }
    this._transports[id] = transport
  }

  addLogger(id: string, transports: ?(string[])): winston.Logger {
    let options = {
      transports: [],
      rewriters: [
        function(level, msg, meta) {
          /* include the logger id in the meta as 'context' field */
          meta.context = id
          return meta
        }
      ]
    }
    transports = transports || ['console']
    transports.forEach(transport => {
      if (this._transports[transport]) {
        options.transports.push(this._transports[transport])
      }
    })
    return this._loggers.add(id, options)
  }

  getLogger(id: string): winston.Logger {
    return this._loggers.get(id)
  }

  setEnebularAgentManager(agentManager: AgentManagerMediator) {
    if (this._enebularTransport) {
      this._enebularTransport.setAgentManager(agentManager)
    }
  }

  activateEnebular(active: boolean) {
    if (this._enebularTransport) {
      this._enebularTransport.activate(active)
    }
  }

  configureEnebular(config: WinstonEnebularConfig) {
    if (this._enebularTransport) {
      this._enebularTransport.configure(config)
    }
  }

  async shutdown() {
    this._loggers.close()
    if (this._enebularTransport) {
      await this._enebularTransport.cleanUp()
    }
  }
}
