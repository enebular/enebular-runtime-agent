/* @flow */
import path from 'path'
import commander from 'commander'
import pkg from '../package.json'
import fs from 'fs'
import { execSync } from 'child_process'

import Constants from './constants'

const systemdTemplate =
  '[Unit]\n' +
  'Description=Enebular agent\n' +
  'Documentation=https://docs.enebular.com/\n' +
  'After=network.target network-online.target\n' +
  'Wants=network-online.target\n' +
  '\n' +
  '[Service]\n' +
  'User=%USER%\n' +
  'Environment=PATH=%NODE_PATH%:/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin\n' +
  'Environment=ENEBULAR_AGENT_HOME=%HOME_PATH%\n' +
  'Environment=DEBUG="debug"\n' +
  '%APPEND_ENV%' +
  'PIDFile=%HOME_PATH%/enebular-agent.pid\n' +
  '\n' +
  'ExecStart=%START_AGENT%\n' +
  'ExecStop=%STOP_AGENT%\n' +
  '\n' +
  '[Install]\n' +
  'WantedBy=multi-user.target network-online.target\n'

export default class EnebularCommander {
  constructor() {
    commander
      .version(pkg.version, '-v, --version')
      .option(
        '-u --startup-user <username>',
        'define user when generating startup script'
      )
      .option(
        '-s --startup-service-name <name>',
        'define service name when generating startup script'
      )
      .option(
        '-p --startup-register-home-path <home path>',
        'define home path when generating startup script'
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
    commander
      .command('kill')
      .description('kill daemon')
      .action(() => {
        this.killDaemon()
      })
  }

  requireRootUser() {
    console.log('You have to run this with root permission.')
    process.exit(1)
  }

  appendEnvironment(src: string, key: string) {
    console.log('\t' + key + ':' + Constants[key])
    return src + 'Environment=' + key + '="' + Constants[key] + '"\n'
  }

  startupRegister() {
    let user = commander.user || process.env.USER
    let serviceName = commander.serviceName || 'enebular-agent-' + user

    console.log('user:', user)
    console.log('service name:', serviceName)

    if (process.getuid() !== 0) {
      this.requireRootUser()
    }

    let appendEnvs = ''
    appendEnvs = this.appendEnvironment(appendEnvs, 'ENEBULAR_CONFIG_PATH')
    appendEnvs = this.appendEnvironment(appendEnvs, 'NODE_RED_DIR')
    appendEnvs = this.appendEnvironment(appendEnvs, 'NODE_RED_DATA_DIR')
    appendEnvs = this.appendEnvironment(appendEnvs, 'NODE_RED_COMMAND')
    if (Constants.ENEBULAR_AGENT_PROGRAM === 'enebular-awsiot-agent') {
      appendEnvs = this.appendEnvironment(appendEnvs, 'AWSIOT_CONFIG_FILE')
    }

    let template = systemdTemplate
    let destination = '/etc/systemd/system/' + serviceName + '.service'
    let startAgentCommand = process.mainModule.filename
    template = template
      .replace(/%APPEND_ENV%/g, appendEnvs)
      .replace(/%START_AGENT%/g, startAgentCommand)
      .replace(/%STOP_AGENT%/g, process.mainModule.filename + ' kill')
      .replace(/%NODE_PATH%/g, path.dirname(process.execPath))
      .replace(/%USER%/g, user)
      .replace(
        /%HOME_PATH%/g,
        commander.startupRegisterHomePath
          ? path.resolve(commander.startupRegisterHomePath, '.enebular-agent')
          : Constants.ENEBULAR_AGENT_HOME
      )

    try {
      fs.writeFileSync(destination, template)
    } catch (e) {
      console.error('Failure when trying to write startup script')
      console.error(e.message || e)
    }

    let commands = ['systemctl enable ' + serviceName]

    try {
      fs.readFileSync(Constants.ENEBULAR_AGENT_PID_FILE).toString()
    } catch (e) {
      commands = [
        'systemctl enable ' + serviceName,
        'systemctl start ' + serviceName,
        'systemctl daemon-reload',
        'systemctl status ' + serviceName
      ]
    }

    commands.forEach(item => {
      console.log('Executing ' + item + '...')
      execSync(item, (err, stdout, stderr) => {
        console.log(stdout)
        console.log(stderr)
        if (err) {
          console.error(err)
        }
      })
    })
  }

  startupUnregister() {
    let user = commander.user || process.env.USER
    let serviceName = commander.serviceName || 'enebular-agent-' + user

    console.log('user:', user)
    console.log('service name:', serviceName)

    if (process.getuid() !== 0) {
      this.requireRootUser()
    }

    let commands = [
      'systemctl stop ' + serviceName,
      'systemctl disable ' + serviceName,
      'rm /etc/systemd/system/' + serviceName + '.service'
    ]

    execSync(commands.join('&& '), (err, stdout, stderr) => {
      console.log(stdout)
      console.log(stderr)
      if (err) {
        console.error(err)
      }
    })
  }

  killDaemon() {
  }

  argumentsHasCommand() {
    if (
      process.argv.indexOf('startup-register') > -1 ||
      process.argv.indexOf('startup-unregister') > -1 ||
      process.argv.indexOf('kill') > -1
    ) {
      return true
    }
    return false
  }

  processCommand() {
    commander.parse(process.argv)
    return this.argumentsHasCommand()
  }
}
