/* @flow */
import commander from 'commander'
import pkg from '../package.json'
import ProcessUtil from './process-util'
import Startup from './startup'

import Config from './config'

export default class CommandLine {
  _subCommand: string
  _subCommandOptions: Object
  _configOptionMap: Object = {}

  constructor() {
    commander.version(pkg.version, '-v, --version')

    this.addConfigOption(
      '--enebular-config-file <path>',
      'Enebular config file path',
      'ENEBULAR_CONFIG_PATH',
      'enebularConfigFile'
    )
    this.addConfigOption(
      '--node-red-dir <path>',
      'Node-RED installation path',
      'NODE_RED_DIR',
      'nodeRedDir'
    )
    this.addConfigOption(
      '--node-red-data-dir <path>',
      'Node-RED data path',
      'NODE_RED_DATA_DIR',
      'nodeRedDataDir'
    )
    this.addConfigOption(
      '--node-red-command <command>',
      'Node-RED startup command',
      'NODE_RED_COMMAND',
      'nodeRedCommand'
    )
    this.addConfigOption(
      '--enable-syslog',
      'Enable syslog at info level',
      'ENABLE_SYSLOG',
      'enableSyslog'
    )

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
  }

  parse() {
    commander.parse(process.argv)
  }

  hasSubCommand() {
    return !!this._subCommand
  }

  processSubCommand(config: Config) {
    switch (this._subCommand) {
      case 'startup-register':
      case 'startup-unregister':
        const user = this._subCommandOptions.startupUser || process.env.USER
        const serviceName =
          this._subCommandOptions.startupServiceName || 'enebular-agent-' + user
        console.log('user:', user)
        console.log('service name:', serviceName)

        const func =
          this._subCommand === 'startup-register'
            ? Startup.startupRegister
            : Startup.startupUnregister
        return func(user, serviceName, config)
      case 'kill':
        return ProcessUtil.killProcessByPIDFile(
          config.get('ENEBULAR_AGENT_PID_FILE')
        )
      default:
        console.log(this._subCommand + ' is not supported.')
        return false
    }
  }

  addConfigOption(
    option: string,
    description: string,
    configName: string,
    optionName: string
  ) {
    commander.option(option, description)
    this._configOptionMap[configName] = optionName
  }

  getConfigOptions() {
    let options = []
    const myself = this
    const configItems = Object.keys(this._configOptionMap)
    configItems.forEach(function(configName) {
      const optionName = myself._configOptionMap[configName]
      if (commander[optionName]) {
        options[configName] = commander[optionName]
      }
    })
    return options
  }
}
