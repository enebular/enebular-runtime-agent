import * as fs from 'fs'
import * as path from 'path'
import * as util from 'util'
import * as rimraf from 'rimraf'
import * as os from 'os'
import checkDiskSpace from 'check-disk-space'
import request from 'request'
import progress from 'request-progress'

import Config from './config'
import AgentInfo from './agent-info'
import { UserInfo, Utils } from './utils'
import { SystemIf } from './system'
import Log from './log'

export interface AgentInstallerIf {
  install(installPath: string, userInfo: UserInfo): Promise<AgentInfo>
  build(
    agentInfo: AgentInfo,
    newAgentInfo: AgentInfo,
    userInfo: UserInfo
  ): Promise<void>
}

export class AgentInstaller implements AgentInstallerIf {
  private _config: Config
  private _minimumRequiredDiskSpace: number = 400 * 1024 * 1024 // 400 MiB
  private _maxFetchRetryCount: number = 3
  private _fetchRetryCount: number = 0
  private _npmBuildEnv: NodeJS.ProcessEnv = {}
  private _binBuildEnv: NodeJS.ProcessEnv = {}
  private _log: Log
  private _system: SystemIf

  public constructor(config: Config, log: Log, system: SystemIf) {
    this._config = config
    this._log = log
    this._system = system
  }

  private _download(url: string, path: string): Promise<{}> {
    const onProgress = (state): void => {
      this._log.debug(
        util.format(
          'Download progress: %f%% @ %fKB/s, %fsec',
          state.percent ? Math.round(state.percent * 100) : 0,
          state.speed ? Math.round(state.speed / 1024) : 0,
          state.time.elapsed ? Math.round(state.time.elapsed) : 0
        )
      )
    }
    this._log.debug(`Downloading ${url} to ${path} `)
    return new Promise((resolve, reject) => {
      const fileStream = fs.createWriteStream(path)
      fileStream.on('error', err => {
        reject(err)
      })
      progress(request(url), {
        delay: 5000,
        throttle: 5000
      })
        .on('response', response => {
          this._log.debug(
            `Response: ${response.statusCode}: ${response.statusMessage}`
          )
          if (response.statusCode >= 400) {
            reject(
              new Error(
                `Error response: ${response.statusCode}: ${
                  response.statusMessage
                }`
              )
            )
          }
        })
        .on('progress', onProgress)
        .on('error', err => {
          reject(err)
        })
        .on('end', () => {
          resolve()
        })
        .pipe(fileStream)
    })
  }

  private async _fetch(
    url: string,
    path: string,
    userInfo: UserInfo
  ): Promise<boolean> {
    let usageInfo
    try {
      usageInfo = await checkDiskSpace(path)
    } catch (err) {
      throw new Error('Failed to get free space: ' + err.message)
    }
    if (usageInfo.free < this._minimumRequiredDiskSpace) {
      throw new Error(
        `Not enough storage space (available: ${usageInfo.free}B, required: ${
          this._minimumRequiredDiskSpace
        }B)`
      )
    }

    try {
      if (fs.existsSync(path)) {
        fs.unlinkSync(path)
      }
    } catch (err) {
      throw new Error(`Failed to remove old agent file:\n${err.message}`)
    }

    try {
      await this._download(url, path)
    } catch (err) {
      throw new Error(
        `Failed to download agent from url: ${url}\n${err.message}`
      )
    }

    try {
      await Utils.spawn('tar', ['-tf', path], this._log, {
        uid: userInfo.uid,
        gid: userInfo.gid
      })
    } catch (err) {
      throw new Error(`Tarball integrity check failed: ${path}\n${err.message}`)
    }
    return true
  }

  public async _fetchWithRetry(
    url: string,
    path: string,
    userInfo: UserInfo
  ): Promise<boolean> {
    return new Promise(async resolve => {
      try {
        await this._fetch(url, path, userInfo)
        this._fetchRetryCount = 0
        resolve(true)
      } catch (err) {
        this._fetchRetryCount++
        if (this._fetchRetryCount <= this._maxFetchRetryCount) {
          this._log.debug(
            `Failed to fetch agent, retry in 1 second ...\n${err.message}`
          )
          setTimeout(async () => {
            resolve(await this._fetchWithRetry(url, path, userInfo))
          }, 1000)
        } else {
          this._fetchRetryCount = 0
          this._log.error(
            `Failed to to fetch agent, retry count(${
              this._maxFetchRetryCount
            }) reaches max\n${err.message}`
          )
          resolve(false)
        }
      }
    })
  }

  private _extract(
    tarball: string,
    dst: string,
    userInfo: UserInfo
  ): Promise<{}> {
    try {
      if (fs.existsSync(dst)) {
        rimraf.sync(dst)
      }
      fs.mkdirSync(dst)
      fs.chownSync(dst, userInfo.uid, userInfo.gid)
    } catch (err) {
      throw new Error(`Failed to create agent directory:\n${err.message}`)
    }

    this._log.debug(`Extracting ${tarball} to ${dst} ...`)
    return Utils.spawn(
      'tar',
      ['-xzf', tarball, '-C', dst, '--strip-components', '1'],
      this._log,
      {
        uid: userInfo.uid,
        gid: userInfo.gid
      }
    )
  }

  private _buildNpmPackage(path: string, userInfo: UserInfo): Promise<{}> {
    return Utils.spawn('npm', ['i', '--production'], this._log, {
      cwd: path,
      env: this._npmBuildEnv,
      uid: userInfo.uid,
      gid: userInfo.gid
    })
  }

  private _buildConnector(
    path: string,
    cmd: string,
    args: string[],
    userInfo: UserInfo
  ): Promise<{}> {
    return Utils.spawn(cmd, args, this._log, {
      cwd: path,
      env: this._binBuildEnv,
      uid: userInfo.uid,
      gid: userInfo.gid
    })
  }

  private async _buildAWSIot(
    installPath: string,
    userInfo: UserInfo
  ): Promise<void> {
    await Utils.taskAsync(
      'Building awsiot port',
      this._log,
      async (): Promise<{}> => {
        return this._buildNpmPackage(`${installPath}//ports/awsiot`, userInfo)
      }
    )
    await Utils.taskAsync(
      'Building awsiot-thing-creator',
      this._log,
      async (): Promise<{}> => {
        return this._buildNpmPackage(
          `${installPath}/tools/awsiot-thing-creator`,
          userInfo
        )
      }
    )
  }

  private async _buildMbedCloudConnector(
    agentPath: string,
    installPath: string,
    userInfo: UserInfo
  ): Promise<void> {
    await Utils.taskAsync(
      'Configuring mbed-cloud-connector',
      this._log,
      async (): Promise<{}> => {
        return this._buildConnector(
          `${installPath}/tools/mbed-cloud-connector`,
          'mbed',
          ['config', 'root', '.'],
          userInfo
        )
      }
    )

    await Utils.taskAsync(
      'Deploying mbed-cloud-connector',
      this._log,
      async (): Promise<{}> => {
        return this._buildConnector(
          `${installPath}/tools/mbed-cloud-connector`,
          'mbed',
          ['deploy'],
          userInfo
        )
      }
    )

    const factoryMode = this._config.getString('PELION_MODE') == 'factory'
    if (!factoryMode) {
      await Utils.taskAsync(
        'Copy mbed-cloud-connector developer credentials',
        this._log,
        async (): Promise<{}> => {
          return Utils.copy(
            this._log,
            `${agentPath}/tools/mbed-cloud-connector/mbed_cloud_dev_credentials.c`,
            `${installPath}/tools/mbed-cloud-connector/mbed_cloud_dev_credentials.c`,
            userInfo
          )
        }
      )
    }

    await Utils.taskAsync(
      'Building mbed-cloud-connector',
      this._log,
      async (): Promise<{}> => {
        const cmakeConfig = factoryMode ? 'define_factory.txt' : 'define.txt'
        const args = (
          'pal-platform/pal-platform.py fullbuild --target x86_x64_NativeLinux_mbedtls --toolchain GCC' +
          ` --external ./../${cmakeConfig} --name enebular-agent-mbed-cloud-connector.elf`
        ).split(' ')
        return this._buildConnector(
          `${installPath}/tools/mbed-cloud-connector`,
          'python',
          args,
          userInfo
        )
      }
    )

    Utils.task(
      `Verifying mbed-cloud-connector`,
      this._log,
      (): void => {
        if (
          !fs.existsSync(
            `${installPath}/tools/mbed-cloud-connector` +
              '/out/Release/enebular-agent-mbed-cloud-connector.elf'
          )
        ) {
          throw new Error('Verifying mbed-cloud-connector failed.')
        }
      }
    )
  }

  private async _installFromURL(
    url: string,
    tallballPath: string,
    installPath: string,
    userInfo: UserInfo
  ): Promise<void> {
    await Utils.taskAsync(
      'Fetching new agent',
      this._log,
      async (): Promise<boolean> => {
        if (!(await this._fetchWithRetry(url, tallballPath, userInfo))) {
          throw new Error(`Failed to fetch agent`)
        }
        return true
      }
    )

    await Utils.taskAsync(
      'Extracting new agent',
      this._log,
      async (): Promise<boolean> => {
        await this._extract(tallballPath, installPath, userInfo)
        return true
      }
    )
  }

  private _getNodeJSDownloadURL(version: string): string {
    const arch = os.arch() == 'x32' ? 'x86' : os.arch()
    const platform = os.platform()
    return `${this._config.getString(
      'NODE_JS_DOWNLOAD_BASE_URL'
    )}/${version}/node-${version}-${platform}-${arch}.tar.gz`
  }

  public async build(
    agentInfo: AgentInfo,
    newAgentInfo: AgentInfo,
    userInfo: UserInfo
  ): Promise<void> {
    const installPath = newAgentInfo.path
    const nodejsPath = path.resolve(
      `/home/${userInfo.user}/nodejs-${newAgentInfo.nodejsVersion}`
    )
    if (!fs.existsSync(nodejsPath)) {
      this._log.info(
        `Installing nodejs-${newAgentInfo.nodejsVersion} to ${nodejsPath} ...`
      )
      await this._installFromURL(
        this._getNodeJSDownloadURL(newAgentInfo.nodejsVersion),
        '/tmp/nodejs-' + Utils.randomString(),
        nodejsPath,
        userInfo
      )
    }

    await this._system.installDebianPackages(['build-essential', 'tree'])

    this._npmBuildEnv['PATH'] = `${nodejsPath}/bin:${process.env['PATH']}`
    await Utils.taskAsync(
      `Building agent ${newAgentInfo.version} `,
      this._log,
      async (): Promise<{}> => {
        return this._buildNpmPackage(`${installPath}/agent`, userInfo)
      }
    )

    await Utils.taskAsync(
      `Building Node-RED`,
      this._log,
      async (): Promise<{}> => {
        return this._buildNpmPackage(`${installPath}/node-red`, userInfo)
      }
    )

    if (agentInfo.installed.awsiot) {
      await this._buildAWSIot(installPath, userInfo)
    }

    if (agentInfo.installed.pelion) {
      await this._system.installDebianPackages(['git', 'cmake', 'python-pip'])
      await Utils.taskAsync(
        'Building pelion port ',
        this._log,
        async (): Promise<{}> => {
          return this._buildNpmPackage(`${installPath}/ports/pelion`, userInfo)
        }
      )
      this._binBuildEnv['PATH'] = `/home/${userInfo.user}/.local/bin:${
        process.env['PATH']
      }`

      if (agentInfo.installed.mbedCloudConnector) {
        await this._buildMbedCloudConnector(
          agentInfo.path,
          installPath,
          userInfo
        )
      }

      if (agentInfo.installed.mbedCloudConnectorFCC) {
        this._log.info(`Building mbed-cloud-connector-fcc`)
      }
    }
  }

  public async install(
    installPath: string,
    userInfo: UserInfo
  ): Promise<AgentInfo> {
    await this._installFromURL(
      this._config.getString('ENEBULAR_AGENT_DOWNLOAD_URL'),
      '/tmp/enebular-runtime-agent-' + Utils.randomString(),
      installPath,
      userInfo
    )
    return AgentInfo.createFromSrc(this._system, installPath)
  }
}

export default AgentInstaller
