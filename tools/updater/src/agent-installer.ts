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
  download(installPath: string, userInfo: UserInfo): Promise<string>
  build(
    port: string,
    newAgentInfo: AgentInfo,
    userInfo: UserInfo,
    mbedCloudDevCredsPath?: string
  ): Promise<void>
  installRuntimeDependencies(
    port: string,
    newAgentInfo: AgentInfo,
    userInfo: UserInfo,
    devCredsPath?: string
  ): Promise<void>
  bundle2PAL(
    installPath: string,
    bundlePath: string,
    userInfo: UserInfo
  ): Promise<void>
  installPAL(
    installPath: string,
    palPath: string,
    userInfo: UserInfo
  ): Promise<void>
}

interface GithubVersionAsset {
  browser_download_url: string
}

interface GithubVersionAssets {
  [position: number]: GithubVersionAsset
  length: number
}

interface GithubVersionRsp {
  tag_name: string
  assets: GithubVersionAssets
}

interface LatestReleaseInfo {
  version: string
}

export class AgentInstaller implements AgentInstallerIf {
  private _config: Config
  private _minimumRequiredDiskSpace: number = 400 * 1024 * 1024 // 400 MiB
  private _maxFetchRetryCount = 3
  private _fetchRetryCount = 0
  private _npmBuildEnv: NodeJS.ProcessEnv = {}
  private _binBuildEnv: NodeJS.ProcessEnv = {}
  private _log: Log
  private _system: SystemIf
  private _arch: string
  private _systemPackageListsUpdated = false

  public constructor(config: Config, log: Log, system: SystemIf) {
    this._config = config
    this._log = log
    this._system = system
    this._arch = this._system.getArch()
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
    return new Promise((resolve, reject): void => {
      const fileStream = fs.createWriteStream(path)
      fileStream.on('error', (err): void => {
        reject(err)
      })
      progress(request(url), {
        delay: 5000,
        throttle: 5000
      })
        .on('response', (response): void => {
          this._log.debug(
            `Response: ${response.statusCode}: ${response.statusMessage}`
          )
          if (response.statusCode >= 400) {
            reject(
              new Error(
                `Error response: ${response.statusCode}: ${response.statusMessage}`
              )
            )
          }
        })
        .on('progress', onProgress)
        .on('error', (err): void => {
          reject(err)
        })
        .on('end', (): void => {
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
        `Not enough storage space (available: ${usageInfo.free}B, required: ${this._minimumRequiredDiskSpace}B)`
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
    return new Promise(
      async (resolve): Promise<void> => {
        try {
          await this._fetch(url, path, userInfo)
          this._fetchRetryCount = 0
          resolve(true)
        } catch (err) {
          this._fetchRetryCount++
          if (this._fetchRetryCount <= this._maxFetchRetryCount) {
            this._log.debug(
              `Failed to fetch agent, retry in 3 second ... ${err.message}`
            )
            setTimeout(async (): Promise<void> => {
              resolve(await this._fetchWithRetry(url, path, userInfo))
            }, 3000)
          } else {
            this._fetchRetryCount = 0
            this._log.debug(
              `Failed to to fetch agent, retry count(${this._maxFetchRetryCount}) reaches max ${err.message}`
            )
            resolve(false)
          }
        }
      }
    )
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
    const options = {
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
    await Utils.taskAsyncWithRetry(
      'Building awsiot port',
      this._log,
      async (): Promise<void> => {
        return this._buildNpmPackage(`${installPath}/ports/awsiot`, userInfo)
      }
    )
    await Utils.taskAsyncWithRetry(
      'Building awsiot-thing-creator',
      this._log,
      async (): Promise<void> => {
        return this._buildNpmPackage(
          `${__dirname}/../../awsiot-thing-creator`,
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
        await this._buildConnector(fccPath, 'mbed', ['deploy', '-v'])
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

    Utils.task(`Verifying mbed-cloud-connector-fcc`, this._log, (): void => {
      if (
        !fs.existsSync(
          fccPath +
            '/__x86_x64_NativeLinux_mbedtls/Release/factory-configurator-client-enebular.elf'
        )
      ) {
        throw new Error('Verifying mbed-cloud-connector-fcc failed.')
      }
    })
  }

  private async _buildMbedCloudConnector(
    installPath: string,
    userInfo: UserInfo,
    devCredsPath?: string
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
        return this._buildConnector(
          connectorPath,
          'mbed',
          ['deploy', '-v'],
          userInfo
        )
      }
    )

    const factoryMode = this._config.getString('PELION_MODE') == 'factory'
    if (!factoryMode) {
      if (devCredsPath) {
        await Utils.taskAsync(
          'Copy mbed-cloud-connector developer credentials',
          this._log,
          async (): Promise<void> => {
            return Utils.copy(
              this._log,
              `${devCredsPath}`,
              `${installPath}/tools/mbed-cloud-connector/mbed_cloud_dev_credentials.c`,
              userInfo
            )
          }
        )
      } else {
        throw new Error(
          'mbed cloud dev credentials c file is required in developer mode.'
        )
      }
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

    await Utils.taskAsync(
      `Verifying mbed-cloud-connector`,
      this._log,
      async (): Promise<void> => {
        const outputPath = connectorPath + '/out/Release'
        const outputFileName = 'enebular-agent-mbed-cloud-connector.elf'
        const outputAbsolutePath = `${outputPath}/${outputFileName}`
        if (!fs.existsSync(outputAbsolutePath)) {
          throw new Error('Missing mbed-cloud-connector executable.')
        }
      }
    )
  }

  private async _downloadNodeJSAndExtract(
    url: string,
    tallballPath: string,
    installPath: string,
    userInfo: UserInfo
  ): Promise<void> {
    await Utils.taskAsync(
      `Fetching nodejs`,
      this._log,
      async (): Promise<void> => {
        if (!(await this._fetchWithRetry(url, tallballPath, userInfo))) {
          throw new Error(`Failed to fetch agent`)
        }
      }
    )

    await Utils.taskAsync(
      `Extracting nodejs`,
      this._log,
      async (): Promise<void> => {
        await this._extract(tallballPath, installPath, userInfo)
      }
    )
    fs.unlinkSync(tallballPath)
  }

  private _getNodeJSDownloadURL(version: string): string {
    const platform = os.platform()
    return `${this._config.getString(
      'NODE_JS_DOWNLOAD_BASE_URL'
    )}/${version}/node-${version}-${platform}-${this._arch}.tar.gz`
  }

  public async installRuntimeDependencies(
    port: string,
    newAgentInfo: AgentInfo,
    userInfo: UserInfo,
    devCredsPath?: string
  ): Promise<void> {
    const nodejsPath = path.resolve(
      `/home/${userInfo.user}/nodejs-${newAgentInfo.nodejsVersion}`
    )
    if (!fs.existsSync(nodejsPath)) {
      this._log.info(
        `Installing nodejs-${newAgentInfo.nodejsVersion} to ${nodejsPath} ...`
      )
      await this._downloadNodeJSAndExtract(
        this._getNodeJSDownloadURL(newAgentInfo.nodejsVersion),
        '/tmp/nodejs-' + Utils.randomString(),
        nodejsPath,
        userInfo
      )
    }

    if (newAgentInfo.version.lessThan(new AgentVersion(2, 9, 0))) return

    if (!this._systemPackageListsUpdated) {
      await Utils.taskAsyncWithRetry(
        `Updating system package lists`,
        this._log,
        async (): Promise<void> => {
          await this._system.updatePackageLists()
        },
        false,
        3,
        10
      )
      this._systemPackageListsUpdated = true
    }

    await Utils.taskAsyncWithRetry(
      `Install Debian dependencies`,
      this._log,
      async (): Promise<void> => {
        await this._system.installDebianPackages(['openssh-server'])
      },
      false,
      3,
      10
    )

    const remoteMaintenanceUser = this._config.getString('REMOTE_MAINTENANCE_USER_NAME')
    if (!await Utils.userExists(this._log, remoteMaintenanceUser)) {
      await Utils.taskAsync(
        `Creating Remote Maintenance User`,
        this._log,
        async (): Promise<void> => {
          if (!this._config.isOverridden('REMOTE_MAINTENANCE_USER_PASSWORD')) {
            this._log.info(`Creating ${remoteMaintenanceUser} using default password`)
          }
          try {
            await this._createRemoteMaintenanceUser(remoteMaintenanceUser,
                this._config.getString('REMOTE_MAINTENANCE_USER_PASSWORD'))
          }
          catch (err) {
            if (await Utils.userExists(this._log, remoteMaintenanceUser)) {
              await Utils.spawn(`userdel`, ['--remove', remoteMaintenanceUser], this._log)
            }
            throw err
          }
        }
      )
    }

    const agentPath = newAgentInfo.path
    await Utils.taskAsync(
      `Applying file permissions`,
      this._log,
      async (): Promise<void> => {
        const rootInfo = Utils.getUserInfo('root')
        await Utils.chown(this._log, nodejsPath, rootInfo)
        await Utils.chown(this._log, agentPath, rootInfo)
        await Utils.chown(this._log, `${agentPath}/node-red/.node-red-config`, userInfo)
        await Utils.chown(this._log, `${agentPath}/ports/${port}`, userInfo)
        await Utils.chown(this._log, `${agentPath}/ports/${port}/lib`, rootInfo)
        await Utils.chown(this._log, `${agentPath}/ports/${port}/bin`, rootInfo)
        await Utils.chown(this._log, `${agentPath}/ports/${port}/node_modules`, rootInfo)
        await Utils.chown(this._log, `${agentPath}/agent/keys/enebular`, rootInfo)
        await Utils.chmod(this._log, `${agentPath}/agent/keys/enebular`, '0600')
      }
    )

    if (port == 'pelion') {
      const mode = this._config.getString('PELION_MODE')
      
      await Utils.taskAsync(
        `Renaming mbed-cloud-connector`,
        this._log,
        async (): Promise<void> => {
          const connectorPath = `${agentPath}/tools/mbed-cloud-connector`
          const binPath = `./enebular-agent-mbed-cloud-connector-${mode}.elf`
          const dstPath = `./enebular-agent-mbed-cloud-connector.elf`
          if (!fs.existsSync(`${connectorPath}/out/Release/${dstPath}`)) {
            // binary
            try {
              await Utils.mv(`${connectorPath}/out/Release/${binPath}`, `${connectorPath}/out/Release/${dstPath}`)
            } catch (err) {
              throw new Error(
                `Failed to restore mbed-cloud-connector from ${connectorPath}/out/Release/${binPath} to
                ${connectorPath}/out/Release/${dstPath}: ${err.message}`
              )
            }
          }
        }
      )

      await Utils.taskAsync(
        `Creating mbed-cloud-connector mode.info`,
        this._log,
        async (): Promise<void> => {
        const pelionDatePath = `${agentPath}/ports/pelion/.pelion-connector`
        if (!fs.existsSync(pelionDatePath)) {
          await Utils.mkdirp(this._log, pelionDatePath, userInfo)
        }

        const modeFile = `${pelionDatePath}/mode.info`
        fs.writeFileSync(modeFile, mode, 'utf8')
        await Utils.chown(this._log, modeFile, userInfo)
      })

      if (mode === 'developer') {
        if (devCredsPath) {
          const credsPath = `${agentPath}/tools/mbed-cloud-connector/mbed_cloud_dev_credentials.c`
          if (!fs.existsSync(credsPath)) {
            await Utils.taskAsync(
              'Copy mbed-cloud-connector developer credentials',
              this._log,
              async (): Promise<void> => {
                return Utils.copy(
                  this._log,
                  devCredsPath,
                  credsPath
                )
              }
            )
          }
        } else {
          throw new Error(
            'mbed cloud dev credentials c file is required in developer mode.'
          )
        }
      }
    }
  }

  private async _createRemoteMaintenanceUser(username: string, password: string) {
    let pwd = Utils.execReturnStdout(
      `python -c "import crypt, random, hashlib, base64; salt=base64.b64encode(hashlib.sha384(str(random.SystemRandom().random())).digest(), './'); print(crypt.crypt('${password}', '\\$6\\$' + salt))"`
    )
    if (!pwd) {
          throw new Error('failed to generate password using openssl')
    }
    pwd = pwd.trim().replace(/(\n|\r)+$/, '')
    return Utils.spawn(`useradd`, ['-m', '-G', 'sudo', '-r', '-p', pwd, username], this._log)
  }

  public async build(
    port: string,
    newAgentInfo: AgentInfo,
    userInfo: UserInfo,
    mbedCloudDevCredsPath?: string
  ): Promise<void> {
    const installPath = newAgentInfo.path
    const nodejsPath = path.resolve(
      `/home/${userInfo.user}/nodejs-${newAgentInfo.nodejsVersion}`
    )

    if (!fs.existsSync(nodejsPath)) {
      this._log.info(
        `Installing nodejs-${newAgentInfo.nodejsVersion} to ${nodejsPath} ...`
      )
      await this._downloadNodeJSAndExtract(
        this._getNodeJSDownloadURL(newAgentInfo.nodejsVersion),
        '/tmp/nodejs-' + Utils.randomString(),
        nodejsPath,
        userInfo
      )
    }

    if (!this._systemPackageListsUpdated) {
      await Utils.taskAsyncWithRetry(
        `Updating system package lists`,
        this._log,
        async (): Promise<void> => {
          await this._system.updatePackageLists()
        },
        false,
        3,
        10
      )
      this._systemPackageListsUpdated = true
    }

    await Utils.taskAsyncWithRetry(
      `Install Debian dependencies`,
      this._log,
      async (): Promise<void> => {
        await this._system.installDebianPackages(['build-essential', 'python'])
      },
      false,
      3,
      10
    )

    this._npmBuildEnv['PATH'] = `${nodejsPath}/bin:${process.env['PATH']}`
    await Utils.taskAsyncWithRetry(
      `Building agent ${newAgentInfo.version}`,
      this._log,
      async (): Promise<void> => {
        return this._buildNpmPackage(`${installPath}/agent`, userInfo)
      }
    )

    await Utils.taskAsyncWithRetry(
      `Building Node-RED`,
      this._log,
      async (): Promise<void> => {
        return this._buildNpmPackage(`${installPath}/node-red`, userInfo)
      }
    )

    if (port == 'awsiot') {
      await this._buildAWSIoT(installPath, userInfo)
    } else {
      await Utils.taskAsyncWithRetry(
        'Building pelion port ',
        this._log,
        async (): Promise<void> => {
          return this._buildNpmPackage(`${installPath}/ports/pelion`, userInfo)
        }
      )
      this._binBuildEnv[
        'PATH'
      ] = `/home/${userInfo.user}/.local/bin:${process.env['PATH']}`
      this._binBuildEnv['PYTHONUSERBASE'] = `/home/${userInfo.user}/.local`
      this._binBuildEnv['PYTHONPATH'] = `/usr/lib/python2.7`

      if (newAgentInfo.version.greaterThan(new AgentVersion(2, 3, 0))) {
        await Utils.taskAsyncWithRetry(
          'Checking dependencies for mbed-cloud-connector',
          this._log,
          async (): Promise<void> => {
            await this._system.installDebianPackages([
              'git',
              'cmake',
              'python-dev',  // Required by mbed-cli, but not installed by default Jessie 8.11
              'python-pip'
            ])

            // Install in advance to not process "Auto-installing missing Python modules"
            await this._system.installPythonPackages(
              [
                'colorama<0.5,>=0.3',           // by mbed-os-tools requirements.txt
                'Jinja2>=2.10.1,<2.11',         // by mbed-os requirements.txt
                'pyYAML==4.2b1',                // by mbed-os requirements.txt
                'mbed-ls>=1.5.1,<1.8',          // by mbed-os requirements.txt
                'mbed-host-tests>=1.4.4,<1.6',  // by mbed-os requirements.txt
                'mbed-greentea>=0.2.24,<1.8',   // by mbed-os requirements.txt
                'fuzzywuzzy==0.17.0',           // Fixed with operable version
                'pyelftools>=0.24,<=0.25',      // by mbed-os requirements.txt
                'jsonschema==2.6.0',            // by mbed-os requirements.txt
              ],
              userInfo
            )

            // Install mbed-cli and Required packages
            return this._system.installPythonPackages(
              ['mbed-cli==1.10.1', 'click==7.0', 'requests>=2.0,<3.0'], // Fixed with operable version
              userInfo
            )
          },
          false,
          3,
          10
        )

        await this._buildMbedCloudConnector(
          installPath,
          userInfo,
          mbedCloudDevCredsPath
        )

        await this._buildMbedCloudConnectorFCC(installPath, userInfo)
      }
    }
  }

  private _getAgentName(version: string, kind: string): string {
    if (kind === 'binary') {
      const platform = os.platform()
      return `enebular-agent-${version}-${platform}-${this._arch}.tar.gz`
    }
    return `enebular-agent-${version}-prebuilt.tar.gz`
  }

  private async _downloadEnebularAgentAndExtract(
    downloadPath: string,
    version: string,
    tallballPath: string,
    installPath: string,
    userInfo: UserInfo
  ): Promise<string> {
    let packageType
    // Only jessie is not supported for binary-package
    if(await this._system.getOSVersion() === 'jessie') {
      packageType = 'prebuilt'
    } else {
      packageType = 'binary'
    }
    
    await Utils.taskAsync(
      `Fetching enebular-agent`,
      this._log,
      async (): Promise<void> => {
        let fileName = this._getAgentName(version, packageType)
        let url = `${downloadPath}/${version}/${fileName}`

        if (!(await this._fetchWithRetry(url, tallballPath, userInfo))) {
          this._log.debug(`No suitable binary package for ${this._arch}, try prebuilt package`)
          packageType = 'prebuilt'
          fileName = this._getAgentName(version, packageType)
          url = `${downloadPath}/${version}/${fileName}`
          if (!(await this._fetchWithRetry(url, tallballPath, userInfo))) {
            throw new Error(`Failed to fetch agent`)
          }
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
    return packageType
  }

  public async download(
    installPath: string,
    userInfo: UserInfo
  ): Promise<string> {
    let downloadPath = this._config.getString('ENEBULAR_AGENT_DOWNLOAD_PATH')
    let version = this._config.getString('ENEBULAR_AGENT_VERSION')
    if (version === 'latest') {
      let info
      try {
        info = await Utils.fetchJSON(`${downloadPath}/latest.info`, {})
      } catch (err) {
        throw new Error(`Failed to get latest version info from s3`)
      }
      version = (info as LatestReleaseInfo).version
    } else {
      if (AgentVersion.parse(version) == undefined) {
        downloadPath = this._config.getString(
          'ENEBULAR_AGENT_TEST_DOWNLOAD_PATH'
        )
      }
    }
    return await this._downloadEnebularAgentAndExtract(
      downloadPath,
      version,
      '/tmp/enebular-runtime-agent-' + Utils.randomString(),
      installPath,
      userInfo
    )
  }

  public async bundle2PAL(
    installPath: string,
    bundlePath: string,
    userInfo: UserInfo
  ): Promise<void> {
    const fccPath = `${installPath}/tools/mbed-cloud-connector-fcc`
    const palPath = `${installPath}/ports/pelion/.pelion-connector`

    if (!fs.existsSync(palPath)) {
      await Utils.mkdirp(this._log, palPath, userInfo)
    }

    if (!path.isAbsolute(bundlePath)) {
      bundlePath = path.resolve(process.cwd(), bundlePath)
    }
    await Utils.taskAsync(
      'Generating mbed cloud credentials',
      this._log,
      async (): Promise<void> => {
        return this._buildConnector(
          palPath,
          `${fccPath}/__x86_x64_NativeLinux_mbedtls/Release/factory-configurator-client-enebular.elf`,
          [bundlePath],
          userInfo
        )
      }
    )
  }

  public async installPAL(
    installPath: string,
    palPath: string,
    userInfo: UserInfo
  ): Promise<void> {
    const pelionDatePath = `${installPath}/ports/pelion/.pelion-connector`

    if (!fs.existsSync(pelionDatePath)) {
      await Utils.mkdirp(this._log, pelionDatePath, userInfo)
    }

    await Utils.taskAsync(
      'Copying mbed cloud credentials',
      this._log,
      async (): Promise<void> => {
        await Utils.copy(
          this._log,
          palPath,
          `${pelionDatePath}/pal`
        )
        return Utils.chown(this._log, `${pelionDatePath}/pal`, userInfo)
      }
    )
  }
}

export default AgentInstaller
