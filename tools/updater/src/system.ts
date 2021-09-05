import * as path from 'path'
import * as fs from 'fs'
import * as rimraf from 'rimraf'

import { UserInfo, Utils } from './utils'
import Log from './log'

export interface SystemIf {
  getServiceLogIgnoreError(serviceName: string, lines: number): string

  stopAgent(service: string, newAgent: boolean): Promise<boolean>
  startAgent(service: string, newAgent: boolean): Promise<boolean>
  flipToNewAgent(
    newAgent: string,
    agent: string,
    agentBackup: string
  ): Promise<boolean>
  flipToOriginalAgent(
    originalAgent: string,
    newAgent: string,
    newAgentBackup: string
  ): Promise<boolean>
  isAgentDead(serviceName: string, newAgent: boolean): boolean
  isServiceRegistered(serviceName: string): boolean
  isServiceEnabled(serviceName: string): boolean
  isServiceActive(serviceName: string): boolean
  isServiceFailed(serviceName: string): boolean
  getAgentPathAndPortFromSystemd(
    serviceName: string
  ): { agentPath: string; agentPort: string }
  getAgentUserFromSystemd(serviceName: string): string
  scanAgentSource(
    path: string
  ): {
    version: string
    awsiot: boolean
    pelion: boolean
    pelionMode: string | undefined
    awsiotThingCreator: boolean
    mbedCloudConnector: boolean
    mbedCloudConnectorFCC: boolean
    nodejsVersion: string
  }
  installDebianPackages(packages: string[]): Promise<void>
  updatePackageLists(): Promise<void>
  installPythonPackages(packages: string[], userInfo: UserInfo): Promise<void>
  updateNodeJSVersionInSystemd(
    user: string,
    version: string,
    newVersion: string,
    file?: string
  ): Promise<void>
  getOSVersion(): Promise<string>
  getArch(): string
  updateRunningUserToRootInSystemd(user: string, file?: string)
  reverseRunningUserToRootInSystemd(user: string, file?: string)
  removeExtraUserInSystemd(user: string, file?: string)
}

export class System implements SystemIf {
  private _log: Log
  private _pipRetryCount = 0

  public constructor(log: Log) {
    this._log = log
  }

  public getServiceLogIgnoreError(serviceName: string, lines: number): string {
    const ret = Utils.execReturnStdout(
      `journalctl -n ${lines} --no-pager -ex -u ${serviceName}`
    )
    return ret ? ret : ''
  }

  public async stopAgent(service: string, newAgent: boolean): Promise<boolean> {
    return this._serviceCtl(service, 'stop')
  }

  public async startAgent(
    service: string,
    newAgent: boolean
  ): Promise<boolean> {
    return this._serviceCtl(service, 'start')
  }

  private async _serviceCtl(name: string, action: string): Promise<boolean> {
    if (action == 'start') {
      try {
        await Utils.spawn('systemctl', ['daemon-reload'], this._log)
      } catch (err) {
        throw new Error(`Failed to reload service config: ${err.message}`)
      }
    }

    try {
      await Utils.spawn('service', [name, action], this._log)
    } catch (err) {
      throw new Error(`Failed to ${action} ${name}: ${err.message}`)
    }
    return true
  }

  public isAgentDead(serviceName: string): boolean {
    return this._isAgentDead(serviceName)
  }

  public isNewAgentDead(serviceName: string): boolean {
    return this._isAgentDead(serviceName)
  }

  private _isAgentDead(serviceName: string): boolean {
    const active = this.isServiceActive(serviceName)
    const failed = this.isServiceFailed(serviceName)
    this._log.debug(`enebular-agent status: active:${active} failed: ${failed}`)
    if (!active) {
      this._log.debug('enebular-agent failed to active')
    }
    if (failed) {
      this._log.debug('enebular-agent status is failed')
    }
    // TODO: should we check other things like if it connected to port or not.
    return failed || !active ? true : false
  }

  public async updateNodeJSVersionInSystemd(
    user: string,
    version: string,
    newVersion: string,
    file?: string
  ): Promise<void> {
    const serviceFile = file
      ? file
      : `/etc/systemd/system/enebular-agent-${user}.service`
    const envToReplace = `Environment=PATH=/home/${user}/nodejs-${version}/bin`
    const newEnv = `Environment=PATH=/home/${user}/nodejs-${newVersion}/bin`
    const tmpFile = '/tmp/enebular-agent-systemd-config-' + Utils.randomString()

    try {
      const content = fs.readFileSync(serviceFile, 'utf8')
      fs.writeFileSync(tmpFile, content.replace(envToReplace, newEnv), 'utf8')
      await Utils.mv(tmpFile, serviceFile)
    } catch (err) {
      throw new Error(
        `Failed to update nodejs version in systemd: ${err.message}`
      )
    }
  }

  public async updateRunningUserToRootInSystemd(user: string, file?: string) {
    const serviceFile = file
      ? file
      : `/etc/systemd/system/enebular-agent-${user}.service`
    const userToReplace = `User=${user}`
    const newUser = 'User=root'
    const tmpFile = '/tmp/enebular-agent-systemd-config-' + Utils.randomString()

    try {
      let content = fs.readFileSync(serviceFile, 'utf8')
      if (content.includes(userToReplace)) {
        content = content.replace(userToReplace, newUser)
      }
      const lines = content.split(/\r?\n/)
      const index = lines.findIndex((line) => {
          return line.startsWith('ExecStart=')
      })
      if (index === -1 ) {
        throw new Error(
          `Failed to update running user in systemd: cannot find ExecStart`
        )
      }
      if (!lines[index].includes(`--user ${user}`)) {
        const newExecStart = `${lines[index]} --user ${user}`
        content = content.replace(lines[index], newExecStart)
      }
      fs.writeFileSync(tmpFile, content, 'utf8')
      await Utils.mv(tmpFile, serviceFile)
    } catch (err) {
      throw new Error(
        `Failed to update running user in systemd: ${err.message}`
      )
    }
  }

  public async reverseRunningUserToRootInSystemd(user: string, file?: string) {
    const serviceFile = file
      ? file
      : `/etc/systemd/system/enebular-agent-${user}.service`
    const userToReplace = 'User=root'
    const newUser = `User=${user}`
    const tmpFile = '/tmp/enebular-agent-systemd-config-' + Utils.randomString()

    try {
      let content = fs.readFileSync(serviceFile, 'utf8')
      if (content.includes(userToReplace)) {
        content = content.replace(userToReplace, newUser)
      }
      const lines = content.split(/\r?\n/)
      const index = lines.findIndex((line) => {
          return line.startsWith('ExecStart=')
      })
      if (index === -1 ) {
        throw new Error(
          `Failed to reverse running user in systemd: cannot find ExecStart`
        )
      }
      if (content.includes(` --user ${user}`)) {
        content = content.replace(` --user ${user}`, '')
      }
      fs.writeFileSync(tmpFile, content, 'utf8')
      await Utils.mv(tmpFile, serviceFile)
    } catch (err) {
      throw new Error(
        `Failed to reverse running user in systemd: ${err.message}`
      )
    }
  }

  public async removeExtraUserInSystemd(user: string, file?: string) {
    const serviceFile = file
      ? file
      : `/etc/systemd/system/enebular-agent-${user}.service`
    const tmpFile = '/tmp/enebular-agent-systemd-config-' + Utils.randomString()

    try {
      let content = fs.readFileSync(serviceFile, 'utf8')
      const lines = content.split(/\r?\n/)
      const index = lines.findIndex((line) => {
          return line.startsWith('ExecStart=')
      })
      if (index === -1 ) {
        throw new Error(
          `Failed to remove extra --user in systemd: cannot find ExecStart`
        )
      }
      const regex = new RegExp(` --user ${user}`, "g")
      const count = (lines[index].match(regex) || []).length
      if (count > 1) {
        const newExecStart = lines[index].replace(regex, '') + ` --user ${user}`
        content = content.replace(lines[index], newExecStart)
        fs.writeFileSync(tmpFile, content, 'utf8')
        await Utils.mv(tmpFile, serviceFile)
      }
    } catch (err) {
      throw new Error(
        `Failed to remove extra --user in systemd: ${err.message}`
      )
    }
  }

  public isServiceRegistered(serviceName: string): boolean {
    const serviceFile = `${serviceName}.service`
    const ret = Utils.execReturnStdout(
      `systemctl list-unit-files ${serviceFile} | grep ${serviceFile} | wc -l`
    )
    return ret && ret.replace(/(\n|\r)+$/, '') == '1' ? true : false
  }

  public isServiceEnabled(serviceName: string): boolean {
    return Utils.exec(`systemctl is-enabled --quiet ${serviceName}`)
  }

  public isServiceActive(serviceName: string): boolean {
    return Utils.exec(`systemctl is-active --quiet ${serviceName}`)
  }

  public isServiceFailed(serviceName: string): boolean {
    return Utils.exec(`systemctl is-failed --quiet ${serviceName}`)
  }

  public getAgentUserFromSystemd(serviceName: string): string {
    let user
    const ret = Utils.execReturnStdout(
      `systemctl show --no-pager -p User ${serviceName}`
    )
    if (ret) {
      const userProp = ret.slice(ret.indexOf('=') + 1)
      user = userProp.replace(/(\n|\r)+$/, '')
    }
    if (!user) {
      throw new Error('Failed to find agent user in systemd')
    }
    if (user === 'root') {
      const ret = Utils.execReturnStdout(
        `systemctl show --no-pager -p ExecStart ${serviceName}`
      )
      if (ret) {
        let execStartArgvStr = ret.split(';')[1].trim()
        if (!execStartArgvStr.startsWith('argv[]')) {
          throw new Error('Failed to find user in systemd, syntax error')
        }
        execStartArgvStr = execStartArgvStr.slice(execStartArgvStr.indexOf('=') + 1)
        const execStartArgv = execStartArgvStr.split(' ')
        const index = execStartArgv.findIndex((arg) => {
            return arg === '--user'
        })
        if (index === -1 || execStartArgv.length < (index + 1)) {
          throw new Error('Failed to find --user <user> in systemd')
        }
        user = execStartArgv[index + 1]
      }
      else {
        throw new Error('Failed to find user in systemd')
      }
    }
    return user
  }

  public getAgentPathAndPortFromSystemd(
    serviceName: string
  ): { agentPath: string; agentPort: string } {
    let agentPath, agentPort
    const ret = Utils.execReturnStdout(
      `systemctl show --no-pager -p ExecStart ${serviceName}`
    )
    if (ret) {
      const execStartProp = ret.slice(ret.indexOf('=') + 1)
      const execStartPath = execStartProp.split(';')[0].substring(7)
      if (execStartPath.length > 0) {
        agentPath = path.resolve(execStartPath, '../../../../')
        agentPort = path.parse(path.resolve(execStartPath, '../../')).name
        agentPort = agentPort == 'local' ? 'pelion' : agentPort
      }
    }
    if (!agentPath) {
      throw new Error('Failed to find agent path in systemd')
    }
    return { agentPath: agentPath, agentPort: agentPort }
  }

  public scanAgentSource(
    path: string
  ): {
    version: string
    awsiot: boolean
    pelion: boolean
    pelionMode: string | undefined
    awsiotThingCreator: boolean
    mbedCloudConnector: boolean
    mbedCloudConnectorFCC: boolean
    nodejsVersion: string
  } {
    if (!fs.existsSync(path)) {
      throw new Error(`The enebular-agent directory was not found: ${path}`)
    }
    // version info
    const packageFile = path + '/agent/package.json'
    if (!fs.existsSync(packageFile)) {
      throw new Error(`Cannot found package.json, path is ${packageFile}`)
    }
    const pkg = JSON.parse(fs.readFileSync(packageFile, 'utf8'))
    const nodejsVersion =
      pkg.engines && pkg.engines.node
        ? `v${pkg.engines.node}`
        : this._getSupportedNodeJSVersion(pkg.version)
    const pelion = fs.existsSync(`${path}/ports/pelion/node_modules`) ||
        fs.existsSync(`${path}/ports/local/node_modules`)
    let pelionMode
    if (pelion) {
      const modeInfoPath = `${path}/ports/pelion/.pelion-connector/mode.info`
      if (fs.existsSync(modeInfoPath)) {
        pelionMode = fs.readFileSync(modeInfoPath, 'utf8')
        pelionMode = pelionMode.trim()
        if (pelionMode !== 'developer' && pelionMode !== 'factory') {
          throw new Error(`mode.info format error: ${pelionMode}`)
        }
      }
    }
    return {
      version: pkg.version,
      awsiot: fs.existsSync(`${path}/ports/awsiot/node_modules`),
      pelion: pelion,
      pelionMode: pelionMode,
      awsiotThingCreator: 
        fs.existsSync(`${path}/tools/awsiot-thing-creator/node_modules`) ||
        fs.existsSync(`${__dirname}/../../awsiot-thing-creator/node_modules`),
      mbedCloudConnector: fs.existsSync(
        `${path}/tools/mbed-cloud-connector/out/Release/enebular-agent-mbed-cloud-connector.elf`
      ),
      mbedCloudConnectorFCC: fs.existsSync(
        `${path}tools/mbed-cloud-connector-fcc/__x86_x64_NativeLinux_mbedtls/Release/factory-configurator-client-enebular.elf`
      ),
      nodejsVersion: nodejsVersion
    }
  }

  public async flipToNewAgent(
    newAgent: string,
    agent: string,
    agentBackup: string
  ): Promise<boolean> {
    if (fs.existsSync(agentBackup)) {
      rimraf.sync(agentBackup)
    }
    return this._replaceDirWithBackup(newAgent, agent, agentBackup)
  }

  public async flipToOriginalAgent(
    originalAgent: string,
    newAgent: string,
    newAgentBackup: string
  ): Promise<boolean> {
    return this._replaceDirWithBackup(originalAgent, newAgent, newAgentBackup)
  }

  private async _replaceDirWithBackup(
    from: string,
    to: string,
    backup: string
  ): Promise<boolean> {
    try {
      await Utils.mv(to, backup, this._log)
    } catch (err) {
      throw new Error(`Failed to move ${to} to ${backup}: ${err.message}`)
    }
    try {
      await Utils.mv(from, to, this._log)
    } catch (err) {
      throw new Error(`Failed to move ${from} to ${to}: ${err.message}`)
    }
    return true
  }

  private _getSupportedNodeJSVersion(agentVersion: string): string {
    switch (agentVersion) {
      default:
        return 'v9.2.1'
    }
  }

  public async getOSVersion(): Promise<string>  {
    let ver = Utils.execReturnStdout('cat /etc/debian_version')
    if (!ver) {
      throw new Error('Failed to get os version from system')
    }
    ver = ver.trim()
    let index = ver.indexOf('.')
    ver = ver.slice( 0, index);
    switch (ver) {
      case '8':
        ver = 'jessie'
        break
      case '9':
        ver = 'stretch'
        break
      case '10':
        ver = 'buster'
        break
    }
    return ver
  }

  public getArch(): string {
    let arch = Utils.execReturnStdout('uname -m')
    if (!arch) {
      throw new Error('Failed to get arch from system')
    }
    arch = arch.trim()
    switch (arch) {
      case 'x86_64':
      case 'amd64':
        arch = 'x64'
        break
      case 'i386':
      case 'i686':
        arch = 'x86'
        break
      case 'aarch64':
        arch = 'arm64'
        break
    }
    return arch
  }

  public async installDebianPackages(packages: string[]): Promise<void> {
    for (let i = 0; i < packages.length; i++) {
      const ret = Utils.execReturnStdout(
        "dpkg-query --show --showformat='${db:Status-Status}\n' " + packages[i]
      )
      if (ret && ret.startsWith('installed')) continue

      try {
        await Utils.spawn('apt-get', ['-y', 'install', packages[i]], this._log)
      } catch (err) {
        throw new Error(`Failed to install ${packages[i]}: ${err.message}`)
      }
    }
  }

  public async updatePackageLists(): Promise<void> {
    try {
      await Utils.spawn('apt-get', ['update'], this._log)
    } catch (err) {
      try {
        await Utils.spawn('apt-get', ['--allow-releaseinfo-change', 'update'], this._log)
      } catch (err) {
        throw new Error(`Failed to apt-get update`)
      }
    }
  }

  public async installPythonPackages(
    packages: string[],
    userInfo: UserInfo
  ): Promise<void> {
    return new Promise(
      async (resolve, reject): Promise<void> => {
        const pipEnv: NodeJS.ProcessEnv = {}
        const userHome = Utils.getUserHome(userInfo.user)
        pipEnv['PYTHONUSERBASE'] = `${userHome}/.local`
        pipEnv['PYTHONPATH'] = `/usr/lib/python2.7`
        // default process envs
        pipEnv['PATH'] = `/usr/local/bin:/bin:/usr/bin`
        pipEnv['USER'] = userInfo.user
        pipEnv['LOGNAME'] = userInfo.user
        pipEnv['HOME'] = userHome
        let options = ['install']
        options = options.concat(packages)
        options.push('--user')
        try {
          await Utils.spawn('pip', options, this._log, {
            uid: userInfo.uid,
            gid: userInfo.gid,
            env: pipEnv
          })
          this._pipRetryCount = 0
          resolve()
        } catch (err) {
          this._pipRetryCount++
          if (this._pipRetryCount <= 5) {
            this._log.debug(
              `Failed to install python dependencies, retry in 1 second ... ${err.message}`
            )
            setTimeout(async (): Promise<void> => {
              try {
                await this.installPythonPackages(packages, userInfo)
                resolve()
              } catch (err) {
                reject(err)
              }
            }, 1000)
          } else {
            this._pipRetryCount = 0
            reject(
              new Error(
                `Failed to install python ${packages.join(' ')}: ${err.message}`
              )
            )
          }
        }
      }
    )
  }
}

export default System
