/* @flow */
import fs from 'fs'
import path from 'path'
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
  '%APPEND_ENV%' +
  'PIDFile=%PID_PATH%\n' +
  '\n' +
  'ExecStart=%START_AGENT%\n' +
  'ExecStop=%STOP_AGENT%\n' +
  'Restart=on-failure\n' +
  'RestartSec=60s\n' +
  '\n' +
  '[Install]\n' +
  'WantedBy=multi-user.target network-online.target\n'

export default class Startup {
  static _requireRootUser(user: string, config: Config) {
    console.log(
      'To register/unregister the Startup Script, copy/paste the following command:'
    )

    let appendEnvs = ''
    const overriddenItems = config.getOverriddenItems()
    const itemKeys = Object.keys(overriddenItems)
    itemKeys.forEach(key => {
      appendEnvs = appendEnvs + ` ${key}='${overriddenItems[key]}'`
    })

    console.log(
      'sudo env PATH=$PATH:' +
        path.dirname(process.execPath) +
        appendEnvs +
        ' ' +
        process.argv[1] +
        ' ' +
        process.argv[2] +
        ' -u ' +
        user
    )
    console.log('You have to run this with root permission.')
  }

  static _appendEnvironment(src: string, key: string, value: string) {
    console.log('\t' + key + ':' + value)
    return src + `Environment='${key}=${value}'\n`
  }

  static _getServiceFilePath(serviceName: string) {
    return '/etc/systemd/system/' + serviceName + '.service'
  }

  static startupRegister(
    user: string,
    serviceName: string,
    config: Config
  ): boolean {
    if (process.getuid() !== 0) {
      Startup._requireRootUser(user, config)
      return false
    }

    let appendEnvs = ''
    const overriddenItems = config.getOverriddenItems()
    const itemKeys = Object.keys(overriddenItems)
    itemKeys.forEach(key => {
      appendEnvs = Startup._appendEnvironment(
        appendEnvs,
        key,
        overriddenItems[key].toString()
      )
    })

    let template = systemdTemplate
    let destination = Startup._getServiceFilePath(serviceName)
    let startAgentCommand =
      process.mainModule.filename + ' --enable-syslog --daemon-mode'
    template = template
      .replace(/%APPEND_ENV%/g, appendEnvs)
      .replace(/%START_AGENT%/g, startAgentCommand)
      .replace(/%STOP_AGENT%/g, process.mainModule.filename + ' kill')
      .replace(/%NODE_PATH%/g, path.dirname(process.execPath))
      .replace(/%USER%/g, user)
      .replace(/%PID_PATH%/g, config.get('ENEBULAR_AGENT_PID_FILE'))

    try {
      fs.writeFileSync(destination, template)
    } catch (e) {
      console.error('Failure when trying to write startup script')
      console.error(e.message || e)
    }

    let commands = ['systemctl enable ' + serviceName]
    commands.push('systemctl daemon-reload')
    commands.push('systemctl restart ' + serviceName)
    commands.push('systemctl status --no-pager ' + serviceName)
    commands.forEach(item => {
      console.log('Executing ' + item + '...')
      execSync(item, { stdio: 'inherit' })
    })
    return true
  }

  static startupUnregister(
    user: string,
    serviceName: string,
    config: Config
  ): boolean {
    if (!fs.existsSync(Startup._getServiceFilePath(serviceName))) {
      console.error('No startup service has been registered.')
      return false
    }

    if (process.getuid() !== 0) {
      Startup._requireRootUser(user, config)
      return false
    }

    let commands = [
      'systemctl stop ' + serviceName,
      'systemctl disable ' + serviceName,
      'rm ' + Startup._getServiceFilePath(serviceName)
    ]

    commands.forEach(item => {
      console.log('Executing ' + item + '...')
      execSync(item, { stdio: 'inherit' })
    })
    return true
  }
}
