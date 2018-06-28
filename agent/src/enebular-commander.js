/* @flow */
import commander from 'commander'
import pkg from '../package.json'
import { exec } from 'child_process'

import Constants from './constants'

export default class EnebularCommander {
  constructor() {
    commander
      .version(pkg.version, '-v, --version')
      .option(
        '-u --user <username>',
        'define user when generating startup script'
      )
      .option(
        '--service-name <name>',
        'define service name when generating startup script'
      )
      .option(
        '--startup-register-config-path <name>',
        'define service name when generating startup script'
      )
      .option('--enable-syslog', 'enable syslog at info level')

    commander
      .command('startup-register')
      .description('setup boot script for enebular agent')
      .action(() => {
        this.startupRegister()
      })
    commander
      .command('startup-unregister')
      .description('remove boot script for enebular agent')
      .action(() => {
        this.startupUnregister()
      })
  }

  requireRootUser() {
    console.log('You have to run this with root permission.')
    process.exit(1)
  }

  startupRegister() {
    let user = commander.user || process.env.USER
    let serviceName = commander.serviceName || 'enebular-agent-' + user

    console.log('user:', user)
    console.log('service name:', serviceName)

    if (process.getuid() !== 0) {
      this.requireRootUser()
    }

    console.log('\tEnebular config file:', Constants.ENEBULAR_CONFIG_PATH)
    console.log('\tNode-RED dir:', Constants.NODE_RED_DIR)
    console.log('\tNode-RED data dir:', Constants.NODE_RED_DATA_DIR)
    console.log('\tNode-RED command:', Constants.NODE_RED_COMMAND)
    console.log('\tAgent program name:', Constants.ENEBULAR_AGENT_PROGRAM)
    if (Constants.ENEBULAR_AGENT_PROGRAM === 'enebular-awsiot-agent') {
      console.log('\tAWSIoT config:', Constants.AWSIOT_CONFIG_FILE)
    }
  }

  startupUnregister() {
    if (process.getuid() !== 0) {
      this.requireRootUser()
    }
  }

  processCommands() {
    let args = process.argv
    commander.parse(process.argv)
    if (
      args.indexOf('startup-register') > -1 ||
      args.indexOf('startup-unregister') > -1
    ) {
      return true
    }
    return false
  }
}
