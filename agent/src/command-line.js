/* @flow */
import commander from 'commander'
import pkg from '../package.json'
import ProcessUtil from './process-util'
import Startup from './startup'

import Config from './config'

export default class CommandLine {
  _command: string
  _commandOptions: Object
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
      'ENEBULAR_ENABLE_SYSLOG',
      'enableSyslog'
    )
    this.addConfigOption(
      '--daemon-mode',
      'Run as daemon',
      'ENEBULAR_DAEMON_MODE',
      'daemonMode'
    )

    commander
      .command('startup-register')
      .description(
        'Register enebular-agent as a system service that starts at boot'
      )
      .option(
        '-u --startup-user <username>',
        'User to run as when started as a system service'
      )
      .option(
        '-s --startup-service-name <name>',
        'Service name used in startup registration'
      )
      .action(options => {
        this._command = 'startup-register'
        this._commandOptions = options
      })
    commander
      .command('startup-unregister')
      .description('Remove enebular-agent as a system service')
      .option(
        '-u --startup-user <username>',
        'User to run as when started as a system service'
      )
      .option(
        '-s --startup-service-name <name>',
        'Service name used in startup registration'
      )
      .action(options => {
        this._command = 'startup-unregister'
        this._commandOptions = options
      })
    commander
      .command('kill')
      .description('kill the agent process')
      .action(options => {
        this._command = 'kill'
        this._commandOptions = options
      })
  }

  parse() {
    commander.parse(process.argv)
  }

  hasCommand() {
    return !!this._command
  }

  processCommand(config: Config) {
    switch (this._command) {
      case 'startup-register':
      case 'startup-unregister':
        const user = this._commandOptions.startupUser || process.env.USER
        const serviceName =
          this._commandOptions.startupServiceName || 'enebular-agent-' + user
        console.log('user:', user)
        console.log('service name:', serviceName)

        const func =
          this._command === 'startup-register'
            ? Startup.startupRegister
            : Startup.startupUnregister
        return func(user, serviceName, config)
      case 'kill':
        return ProcessUtil.killProcessByPIDFile(
          config.get('ENEBULAR_AGENT_PID_FILE')
        )
      default:
        console.log(this._command + ' is not supported.')
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
    let options = {}
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
