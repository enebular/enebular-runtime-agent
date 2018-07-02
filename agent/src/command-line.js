/* @flow */
import path from 'path'
import commander from 'commander'
import pkg from '../package.json'
import fs from 'fs'
import { execSync } from 'child_process'

import Config from './config'

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
  '%APPEND_ENV%' +
  'PIDFile=%HOME_PATH%/enebular-agent.pid\n' +
  '\n' +
  'ExecStart=%START_AGENT%\n' +
  'ExecStop=%STOP_AGENT%\n' +
  '\n' +
  '[Install]\n' +
  'WantedBy=multi-user.target network-online.target\n'

export default class CommandLine {
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
      .option(
        '--enebular-config-file <config file path>',
        'define enebular config file path'
      )
      .option('--node-red-dir <path>', 'define Node-RED installation path')
      .option('--node-red-data-dir <path>', 'define Node-RED data path')
      .option('--node-red-command <command>', 'define Node-RED startup command')
      .option('--enable-syslog', 'enable syslog at info level')

    commander
      .command('startup-register')
      .description('setup boot script for enebular agent')
      .action(() => {
        setTimeout(() => {
          this.startupRegister()
        }, 100) // delay to allow constants to be created first
      })
    commander
      .command('startup-unregister')
      .description('remove boot script for enebular agent')
      .action(() => {
        setTimeout(() => {
          this.startupUnregister()
        }, 100) // delay to allow constants to be created first
      })
    commander
      .command('kill')
      .description('kill daemon')
      .action(() => {
        setTimeout(() => {
          this.killDaemon()
        }, 100) // delay to allow constants to be created first
      })

    commander.parse(process.argv)
  }

  requireRootUser() {
    console.log('You have to run this with root permission.')
    process.exit(1)
  }

  appendEnvironment(src: string, key: string) {
    console.log('\t' + key + ':' + Config[key])
    return src + 'Environment=' + key + '=' + Config[key] + '\n'
  }

  startupRegister() {
    let user = commander.startupUser || process.env.USER
    let serviceName = commander.startupServiceName || 'enebular-agent-' + user

    console.log('user:', user)
    console.log('service name:', serviceName)

    if (process.getuid() !== 0) {
      this.requireRootUser()
    }

    let appendEnvs = ''
    appendEnvs = this.appendEnvironment(appendEnvs, 'ENEBULAR_CONFIG_PATH')
    appendEnvs = this.appendEnvironment(appendEnvs, 'NODE_RED_DIR')
    appendEnvs = this.appendEnvironment(appendEnvs, 'NODE_RED_DATA_DIR')
    if (Config.ENEBULAR_AGENT_PROGRAM === 'enebular-awsiot-agent') {
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
      .replace(/%HOME_PATH%/g, Config.ENEBULAR_AGENT_HOME)

    try {
      fs.writeFileSync(destination, template)
    } catch (e) {
      console.error('Failure when trying to write startup script')
      console.error(e.message || e)
    }

    let commands = ['systemctl enable ' + serviceName]

    try {
      fs.readFileSync(Config.ENEBULAR_AGENT_PID_FILE).toString()
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
    let user = commander.startupUser || process.env.USER
    let serviceName = commander.startupServiceName || 'enebular-agent-' + user

    console.log('user:', user)
    console.log('service name:', serviceName)

    if (!fs.existsSync('/etc/systemd/system/' + serviceName + '.service')) {
      console.error('No startup service has been registered.')
      return
    }

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

  _processIsDead(pid: number) {
    try {
      process.kill(pid, 0)
      return true
    } catch (err) {
      return false
    }
  }

  _checkProcess(pid: number) {
    return new Promise((resolve, reject) => {
      let timeout
      const timer = setInterval(() => {
        if (this._processIsDead(pid) === false) {
          // console.log('pid=%d process killed', pid)
          clearTimeout(timeout)
          clearInterval(timer)
          resolve()
        }
      }, 100)
      timeout = setTimeout(() => {
        clearInterval(timer)
        reject(new Error('timeout to kill process.'))
      }, 1000)
    })
  }

  async _killProcess(pid: number) {
    try {
      process.kill(pid, 'SIGINT')
      await this._checkProcess(pid)
    } catch (err) {
      console.error('%s pid can not be killed', pid, err.stack, err.message)
    }
  }

  killDaemon() {
    if (!fs.existsSync(Config.ENEBULAR_AGENT_PID_FILE)) {
      console.error("Can't find enebular agent pid file")
      return
    }

    try {
      const pid = fs.readFileSync(Config.ENEBULAR_AGENT_PID_FILE)
      this._killProcess(parseInt(pid))
    } catch (err) {
      console.error(err)
    }
  }

  hasEnebularCommand() {
    if (
      process.argv.indexOf('startup-register') > -1 ||
      process.argv.indexOf('startup-unregister') > -1 ||
      process.argv.indexOf('kill') > -1
    ) {
      return true
    }
    return false
  }

  getOption(key: string) {
    return commander[key]
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
