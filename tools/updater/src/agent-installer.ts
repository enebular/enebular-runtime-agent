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
import AgentVersion from './agent-version'
import { UserInfo, Utils } from './utils'
import { SystemIf } from './system'
import Log from './log'

export interface AgentInstallerIf {
  download(installPath: string, userInfo: UserInfo): Promise<void>
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
      throw new Error(`Failed to remove old agent file: ${err.message}`)
    }

    try {
      await this._download(url, path)
    } catch (err) {
      throw new Error(
        `Failed to download agent from url: ${url} ${err.message}`
      )
    }

    try {
      await Utils.spawn('tar', ['-tf', path], this._log, {
        uid: userInfo.uid,
        gid: userInfo.gid
      })
    } catch (err) {
      throw new Error(`Tarball integrity check failed: ${path} ${err.message}`)
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
            `Failed to fetch agent, retry in 1 second ... ${err.message}`
          )
          setTimeout(async () => {
            resolve(await this._fetchWithRetry(url, path, userInfo))
          }, 1000)
        } else {
          this._fetchRetryCount = 0
          this._log.error(
            `Failed to to fetch agent, retry count(${
              this._maxFetchRetryCount
            }) reaches max ${err.message}`
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
  ): Promise<void> {
    try {
      if (fs.existsSync(dst)) {
        rimraf.sync(dst)
      }
      fs.mkdirSync(dst)
      fs.chownSync(dst, userInfo.uid, userInfo.gid)
    } catch (err) {
      throw new Error(`Failed to create agent directory: ${err.message}`)
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

  private _buildNpmPackage(path: string, userInfo: UserInfo): Promise<void> {
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
    userInfo?: UserInfo
  ): Promise<void> {
    let options = {
      cwd: path,
      env: this._binBuildEnv
    }
    if (userInfo) {
      options['uid'] = userInfo.uid
      options['gid'] = userInfo.gid
    }
    return Utils.spawn(cmd, args, this._log, options)
  }

  private async _buildAWSIoT(
    installPath: string,
    userInfo: UserInfo
  ): Promise<void> {
    await Utils.taskAsync(
      'Building awsiot port',
      this._log,
      async (): Promise<void> => {
        return this._buildNpmPackage(`${installPath}/ports/awsiot`, userInfo)
      }
    )
    await Utils.taskAsync(
      'Building awsiot-thing-creator',
      this._log,
      async (): Promise<void> => {
        return this._buildNpmPackage(
          `${installPath}/tools/awsiot-thing-creator`,
          userInfo
        )
      }
    )
  }

  private async _buildMbedCloudConnectorFCC(
    installPath: string,
    userInfo: UserInfo
  ): Promise<void> {
    const fccPath = `${installPath}/tools/mbed-cloud-connector-fcc`
    await Utils.taskAsync(
      'Configuring mbed-cloud-connector-fcc',
      this._log,
      async (): Promise<void> => {
        return this._buildConnector(
          fccPath,
          'mbed',
          ['config', 'root', '.'],
          userInfo
        )
      }
    )

    await Utils.taskAsync(
      'Deploying mbed-cloud-connector-fcc (mbed)',
      this._log,
      async (): Promise<void> => {
        // Require root access as it will install dependencies by itself if missing
        await this._buildConnector(fccPath, 'mbed', ['deploy'])
        return Utils.chown(this._log, fccPath, userInfo)
      }
    )

    await Utils.taskAsync(
      'Deploying mbed-cloud-connector-fcc (platform)',
      this._log,
      async (): Promise<void> => {
        const args = 'pal-platform/pal-platform.py -v deploy --target=x86_x64_NativeLinux_mbedtls generate'.split(
          ' '
        )
        return this._buildConnector(fccPath, 'python', args, userInfo)
      }
    )

    await Utils.taskAsync(
      'Building mbed-cloud-connector-fcc',
      this._log,
      async (): Promise<void> => {
        return this._buildConnector(
          fccPath,
          './build-linux-release.sh',
          [],
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
            fccPath +
              '/__x86_x64_NativeLinux_mbedtls/Release/factory-configurator-client-enebular.elf'
          )
        ) {
          throw new Error('Verifying mbed-cloud-connector-fcc failed.')
        }
      }
    )
  }

  private async _buildMbedCloudConnector(
    agentPath: string,
    installPath: string,
    userInfo: UserInfo
  ): Promise<void> {
    const connectorPath = `${installPath}/tools/mbed-cloud-connector`
    await Utils.taskAsync(
      'Configuring mbed-cloud-connector',
      this._log,
      async (): Promise<void> => {
        return this._buildConnector(
          connectorPath,
          'mbed',
          ['config', 'root', '.'],
          userInfo
        )
      }
    )

    await Utils.taskAsync(
      'Deploying mbed-cloud-connector',
      this._log,
      async (): Promise<void> => {
        return this._buildConnector(connectorPath, 'mbed', ['deploy'], userInfo)
      }
    )

    const factoryMode = this._config.getString('PELION_MODE') == 'factory'
    if (!factoryMode) {
      await Utils.taskAsync(
        'Copy mbed-cloud-connector developer credentials',
        this._log,
        async (): Promise<void> => {
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
      async (): Promise<void> => {
        const cmakeConfig = factoryMode ? 'define_factory.txt' : 'define.txt'
        const args = (
          'pal-platform/pal-platform.py fullbuild --target x86_x64_NativeLinux_mbedtls --toolchain GCC' +
          ` --external ./../${cmakeConfig} --name enebular-agent-mbed-cloud-connector.elf`
        ).split(' ')
        return this._buildConnector(connectorPath, 'python', args, userInfo)
      }
    )

    Utils.task(
      `Verifying mbed-cloud-connector`,
      this._log,
      (): void => {
        if (
          !fs.existsSync(
            connectorPath +
              '/out/Release/enebular-agent-mbed-cloud-connector.elf'
          )
        ) {
          throw new Error('Verifying mbed-cloud-connector failed.')
        }
      }
    )
  }

  private async _downloadAndExtract(
    url: string,
    tallballPath: string,
    installPath: string,
    userInfo: UserInfo
  ): Promise<void> {
    await Utils.taskAsync(
      `Fetching enebular-agent`,
      this._log,
      async (): Promise<void> => {
        if (!(await this._fetchWithRetry(url, tallballPath, userInfo))) {
          throw new Error(`Failed to fetch agent`)
        }
      }
    )

    await Utils.taskAsync(
      `Extracting enebular-agent`,
      this._log,
      async (): Promise<void> => {
        await this._extract(tallballPath, installPath, userInfo)
      }
    )
    fs.unlinkSync(tallballPath)
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
      await this._downloadAndExtract(
        this._getNodeJSDownloadURL(newAgentInfo.nodejsVersion),
        '/tmp/nodejs-' + Utils.randomString(),
        nodejsPath,
        userInfo
      )
    }

    await this._system.installDebianPackages(['build-essential', 'python'])

    this._npmBuildEnv['PATH'] = `${nodejsPath}/bin:${process.env['PATH']}`
    await Utils.taskAsync(
      `Building agent ${newAgentInfo.version} `,
      this._log,
      async (): Promise<void> => {
        return this._buildNpmPackage(`${installPath}/agent`, userInfo)
      }
    )

    await Utils.taskAsync(
      `Building Node-RED`,
      this._log,
      async (): Promise<void> => {
        return this._buildNpmPackage(`${installPath}/node-red`, userInfo)
      }
    )

    if (agentInfo.detectPortType() == 'awsiot') {
      await this._buildAWSIoT(installPath, userInfo)
    } else {
      await Utils.taskAsync(
        'Building pelion port ',
        this._log,
        async (): Promise<void> => {
          return this._buildNpmPackage(`${installPath}/ports/pelion`, userInfo)
        }
      )
      this._binBuildEnv['PATH'] = `/home/${userInfo.user}/.local/bin:${
        process.env['PATH']
      }`

      if (newAgentInfo.version.greaterThan(new AgentVersion(2, 3, 0))) {
        await Utils.taskAsync(
          'Checking dependencies for mbed-cloud-connector',
          this._log,
          async (): Promise<void> => {
            await this._system.installDebianPackages(['git', 'cmake', 'python-pip'])
            return this._system.installPythonPackages(['mbed-cli', 'click', 'requests'])
          }
        )

        await this._buildMbedCloudConnector(
          agentInfo.path,
          installPath,
          userInfo
        )

        await this._buildMbedCloudConnectorFCC(installPath, userInfo)
      }
    }
  }

  public async download(
    installPath: string,
    userInfo: UserInfo
  ): Promise<void> {
    const url = `${this._config.getString(
      'ENEBULAR_AGENT_DOWNLOAD_PATH'
    )}/enebular-agent-${this._config.getString(
      'ENEBULAR_AGENT_VERSION'
    )}-prebuilt.tar.gz`
    await this._downloadAndExtract(
      url,
      '/tmp/enebular-runtime-agent-' + Utils.randomString(),
      installPath,
      userInfo
    )
  }
}

export default AgentInstaller
