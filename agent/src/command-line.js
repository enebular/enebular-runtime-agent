/* @flow */
import commander from 'commander'
import pkg from '../package.json'
import ProcessUtil from './process-util'
import Startup from './startup'

import Config from './config'

export default class CommandLine {
  _subCommand: string
  _subCommandOptions: Object

  constructor() {
    commander
      .version(pkg.version, '-v, --version')
      .option(
        '--enebular-config-file <config file path>',
        'Enebular config file path'
      )
      .option('--node-red-dir <path>', 'Node-RED installation path')
      .option('--node-red-data-dir <path>', 'Node-RED data path')
      .option('--node-red-command <command>', 'Node-RED startup command')
      .option('--enable-syslog', 'Enable syslog at info level')

    commander
      .command('startup-register')
      .description('Setup boot script for enebular agent')
      .option(
        '-u --startup-user <username>',
        'User when generating startup script'
      )
      .option(
        '-s --startup-service-name <name>',
        'Service name when generating startup script'
      )
      .action(options => {
        this._subCommand = 'startup-register'
        this._subCommandOptions = options
      })
    commander
      .command('startup-unregister')
      .description('Remove boot script for enebular agent')
      .option(
        '-u --startup-user <username>',
        'User when generating startup script'
      )
      .option(
        '-s --startup-service-name <name>',
        'Service name when generating startup script'
      )
      .action(options => {
        this._subCommand = 'startup-unregister'
        this._subCommandOptions = options
      })
    commander
      .command('kill')
      .description('kill the agent process')
      .action(options => {
        this._subCommand = 'kill'
        this._subCommandOptions = options
      })

    commander.parse(process.argv)
  }

  processSubCommand(config: Config) {
    const ret = !!this._subCommand

    if (ret) {
      switch (this._subCommand) {
        case 'startup-register':
        case 'startup-unregister':
          const user = this._subCommandOptions.startupUser || process.env.USER
          const serviceName =
            this._subCommandOptions.startupServiceName ||
            'enebular-agent-' + user
          console.log('user:', user)
          console.log('service name:', serviceName)

          const func =
            this._subCommand === 'startup-register'
              ? Startup.startupRegister
              : Startup.startupUnregister
          func(user, serviceName, config)
          break
        case 'kill':
          ProcessUtil.killProcessByPIDFile(
            config.get('ENEBULAR_AGENT_PID_FILE')
          )
          break
        default:
          console.log(this._subCommand + ' is not supported.')
          return false
      }
    }
    return ret
  }

  getAgentOptions() {
    let options = []
    if (commander.enebularConfigFile) {
      options['ENEBULAR_CONFIG_PATH'] = commander.enebularConfigFile
    }
    if (commander.nodeRedDir) {
      options['NODE_RED_DIR'] = commander.nodeRedDir
    }
    if (commander.nodeRedDataDir) {
      options['NODE_RED_DATA_DIR'] = commander.nodeRedDataDir
    }
    if (commander.nodeRedCommand) {
      options['NODE_RED_COMMAND'] = commander.nodeRedCommand
    }
    if (commander.enableSyslog) {
      options['ENABLE_SYSLOG'] = commander.enableSyslog
    }
    return options
  }
}
