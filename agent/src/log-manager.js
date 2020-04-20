/* @flow */

import winston from 'winston'
import { Syslog } from 'winston-syslog'
import { Enebular } from './winston-enebular'
import type { WinstonEnebularConfig } from './winston-enebular'
import type AgentManagerMediator from './agent-manager-mediator'
import Config from './config'

export default class LogManager {
  _transports: { [string]: winston.Transport }
  _loggers: winston.Container
  _enebularTransport: winston.Transport = null

  constructor(config: Config) {
    const level = config.get('ENEBULAR_LOG_LEVEL')

    this._transports = {}

    if (config.get('ENEBULAR_ENABLE_CONSOLE_LOG')) {
      const logFormat = winston.format.printf((info) => {
        const { level, message, ...meta } = info
        let output = ''
        if (meta.context) {
          output += meta.context + ': '
          delete meta.context
        }
        if (meta.module) {
          delete meta.module
        }

        let splat = meta[Symbol.for("splat")]
        let args = ''
        for(let i in splat) {
          if(typeof splat[i] === 'object') {
            if(splat[i].hasOwnProperty('module')) {
              output += splat[i].module + ': '
            } else {
              args += ' ' + JSON.stringify(splat[i], null, 2)
            }
          } else {
            args += ' ' + splat[i]
          }
        }
        output += message + args

        if (meta && Object.keys(meta).length > 0) {
          // If meta carries unhandled exception data serialize the stack nicely
          if (Object.keys(meta).length >= 5 && meta.date && meta.process && meta.os && meta.trace && meta.stack) {
            var stack = meta.stack
            delete meta.stack
            delete meta.trace
            output += ' ' + JSON.stringify(meta, null, 4)
            if (stack) {
              output += '\n' + stack + '\n'
            }
          }
        }
        return output
      })

      this.addTransport(
        new winston.transports.Console({
          name: 'console',
          level: level,
          handleExceptions: true,
          humanReadableUnhandledException: true,
          format: winston.format.combine(
            winston.format.colorize(),
            logFormat
          )
        })
      )
    }

    if (config.get('ENEBULAR_ENABLE_FILE_LOG')) {
      const logFormat = winston.format.printf((info) => {
        let output = ''
        if (info.timestamp) {
          output += info.timestamp + ' - '
        }
        let splat = info[Symbol.for("splat")]
        let args = ''
        let module
        for(let i in splat) {
          if(typeof splat[i] === 'object') {
            if(splat[i].hasOwnProperty('module')) {
              module = splat[i].module
            } else {
              args += ' ' + JSON.stringify(splat[i], null, 2)
            }
          } else {
            args += ' ' + splat[i]
          }
        }
        output += info.level + ': ' + info.message + args

        if (module) {
          output += ' module=' + module
        }
        if (info.context) {
          output += ', context=' + info.context
        }
        return output
      })

      this.addTransport(
        new winston.transports.File({
          name: 'file',
          level: level,
          filename: config.get('ENEBULAR_LOG_FILE_PATH'),
          handleExceptions: true,
          format: winston.format.combine(
            winston.format.timestamp(),
            logFormat
          )
        })
      )
    }

    if (config.get('ENEBULAR_ENABLE_SYSLOG')) {
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

    if (config.get('ENEBULAR_ENABLE_ENEBULAR_LOG')) {
      this._enebularTransport = new Enebular({
        name: 'enebular',
        level: level,
        handleExceptions: true,
        cachePath: config.get('ENEBULAR_ENEBULAR_LOG_CACHE_PATH'),
        maxCacheSize: config.get('ENEBULAR_ENEBULAR_LOG_MAX_CACHE_SIZE'),
        maxSizePerInterval: config.get(
          'ENEBULAR_ENEBULAR_LOG_MAX_SIZE_PER_INTERVAL'
        ),
        sendInterval: config.get('ENEBULAR_ENEBULAR_LOG_SEND_INTERVAL')
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
    const maskFormat = winston.format(info => {
      info.context = id
      return info
    })
    let options = {
      transports: [],
      format: winston.format.combine(
        maskFormat(),
        winston.format.simple()
      )
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
    if (this._enebularTransport) {
      await this._enebularTransport.cleanUp()
    }
    this._loggers.close()
  }
}
