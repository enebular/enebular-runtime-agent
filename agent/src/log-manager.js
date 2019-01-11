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
              // If meta carries unhandled exception data serialize the stack nicely
              if (
                Object.keys(options.meta).length >= 5 &&
                options.meta.hasOwnProperty('date') &&
                options.meta.hasOwnProperty('process') &&
                options.meta.hasOwnProperty('os') &&
                options.meta.hasOwnProperty('trace') &&
                options.meta.hasOwnProperty('stack')
              ) {
                var stack = options.meta.stack
                delete options.meta.stack
                delete options.meta.trace
                output += ' ' + JSON.stringify(options.meta, null, 4)
                if (stack) {
                  output += '\n' + stack.join('\n')
                }
              } else {
                output += ' ' + JSON.stringify(options.meta)
              }
            }
            return output
          }
        })
      )
    }

    if (config.get('ENEBULAR_ENABLE_FILE_LOG')) {
      this.addTransport(
        new winston.transports.File({
          name: 'file',
          level: level,
          filename: config.get('ENEBULAR_LOG_FILE_PATH'),
          handleExceptions: true,
          json: false
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
