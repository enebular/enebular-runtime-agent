/* @flow */
import commander from 'commander'
import pkg from '../package.json'
import ProcessUtil from './process-util'
import Startup from './startup'

import Config from './config'

export default class CommandLine {
  _config: Config
  _command: string
  _commandOptions: Object
  _configOptionMap: Object = {}

  constructor(config: Config) {
    this._config = config
    commander.version(pkg.version, '-v, --version')

    this.addConfigOption(
      'ENEBULAR_CONFIG_PATH',
      '--enebular-config-file <path>'
    )
    this.addConfigOption('NODE_RED_DIR', '--node-red-dir <path>')
    this.addConfigOption('NODE_RED_DATA_DIR', '--node-red-data-dir <path>')
    this.addConfigOption('NODE_RED_COMMAND', '--node-red-command <command>')
    this.addConfigOption('ENEBULAR_ENABLE_SYSLOG', '--enable-syslog')
    this.addConfigOption('ENEBULAR_DAEMON_MODE', '--daemon-mode')

    commander.on('command:*', () => {
      if (!process.env.ENEBULAR_TEST && commander.args.length > 0) {
        this._command = 'unknown'
      }
    })
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
      .command('list-config-items')
      .description('list available config items')
      .action(options => {
        this._command = 'list-config-items'
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

  _listConfigItems() {
    console.log(
      '  Note: all configuration items can be set as environment variables.'
    )
    console.log('')
    console.log(
      '  ' +
        'Name'.padEnd(45) +
        'Command Line Option'.padEnd(35) +
        'Description'
    )
    console.log('')
    const items = this._config.items
    const configKeys = Object.keys(items)
    configKeys.forEach(key => {
      if (items[key].userExpose) {
        let flags = ''
        if (this._configOptionMap[key]) {
          commander.options.forEach(option => {
            if (option.attributeName() === this._configOptionMap[key])
              flags = option.flags
          })
        }
        console.log(
          '  ' + key.padEnd(44) + flags.padEnd(36) + items[key].description
        )
      }
    })
    console.log('')
  }

  parse() {
    commander.parse(process.argv)
  }

  hasCommand() {
    return !!this._command
  }

  processCommand() {
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
        return func(user, serviceName, this._config)
      case 'kill':
        return ProcessUtil.killProcessByPIDFile(
          this._config.get('ENEBULAR_AGENT_PID_FILE')
        )
      case 'list-config-items':
        return this._listConfigItems()
      case 'unknown':
      default:
        console.error(
          'Invalid command: %s\nSee --help for a list of available commands.',
          commander.args.join(' ')
        )
        return false
    }
  }

  addConfigOption(configName: string, option: string) {
    commander.option(option, this._config.getDescription(configName))
    this._configOptionMap[configName] = commander.options
      .slice(-1)[0]
      .attributeName()
  }

  getConfigOptions() {
    let options = {}
    const myself = this
    const configItems = Object.keys(this._configOptionMap)
    configItems.forEach(configName => {
      const optionName = myself._configOptionMap[configName]
      if (commander[optionName]) {
        options[configName] = commander[optionName]
      }
    })
    return options
  }
}
