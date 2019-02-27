import * as fs from 'fs'
import * as path from 'path'
import * as util from 'util'
import * as rimraf from 'rimraf'
import checkDiskSpace from 'check-disk-space'
import request from 'request'
import progress from 'request-progress'

import Config from './config'
import AgentInfo from './agent-info'
import { UserInfo, Utils } from './utils'
import Log from './log'

export default class AgentInstaller {
  private _config: Config
  private _minimumRequiredDiskSpace: number = 400 * 1024 * 1024 // 400 MiB
  private _maxFetchRetryCount: number = 3
  private _fetchRetryCount: number = 0
  private _npmBuildEnv: NodeJS.ProcessEnv = {}
  private _binBuildEnv: NodeJS.ProcessEnv = {}
  private _log: Log
  private _userInfo: UserInfo

  public constructor(config: Config, log: Log, userInfo: UserInfo) {
    this._config = config
    this._log = log
    this._userInfo = userInfo
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

  private async _fetch(url: string, path: string): Promise<boolean> {
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
        uid: this._userInfo.uid,
        gid: this._userInfo.gid
      })
    } catch (err) {
      throw new Error(`Tarball integrity check failed: ${path}\n${err.message}`)
    }
    return true
  }

  public async _fetchWithRetry(url: string, path: string): Promise<boolean> {
    return new Promise(async resolve => {
      try {
        await this._fetch(url, path)
        this._fetchRetryCount = 0
        resolve(true)
      } catch (err) {
        this._fetchRetryCount++
        if (this._fetchRetryCount <= this._maxFetchRetryCount) {
          this._log.debug(
            `Failed to fetch agent, retry in 1 second ...\n${err.message}`
          )
          setTimeout(async () => {
            resolve(await this._fetchWithRetry(url, path))
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

  private _extract(tarball: string, dst: string): Promise<{}> {
    try {
      if (fs.existsSync(dst)) {
        rimraf.sync(dst)
      }
      fs.mkdirSync(dst)
      fs.chownSync(dst, this._userInfo.uid, this._userInfo.gid)
    } catch (err) {
      throw new Error(`Failed to create agent directory:\n${err.message}`)
    }

    this._log.debug(`Extracting ${tarball} to ${dst} ...`)
    return Utils.spawn(
      'tar',
      ['-xzf', tarball, '-C', dst, '--strip-components', '1'],
      this._log,
      {
        uid: this._userInfo.uid,
        gid: this._userInfo.gid
      }
    )
  }

  private _buildNpmPackage(path: string): Promise<{}> {
    return Utils.spawn('npm', ['i', '--production'], this._log, {
      cwd: path,
      env: this._npmBuildEnv,
      uid: this._userInfo.uid,
      gid: this._userInfo.gid
    })
  }

  private _buildConnector(
    path: string,
    cmd: string,
    args: string[]
  ): Promise<{}> {
    return Utils.spawn(cmd, args, this._log, {
      cwd: path,
      env: this._binBuildEnv,
      uid: this._userInfo.uid,
      gid: this._userInfo.gid
    })
  }

  public async build(
    agentInfo: AgentInfo,
    installPath: string
  ): Promise<AgentInfo> {
    this._log.debug('Current agent info:')
    this._log.debug(agentInfo)
    let newAgentInfo = AgentInfo.createFromSrc(installPath)
    this._log.debug('New agent info, before building:')
    this._log.debug(newAgentInfo)
    const nodejsPath = path.resolve(
      `/home/${this._config.getString('ENEBULAR_AGENT_USER')}/nodejs-${
        newAgentInfo.nodejsVersion
      }`
    )
    if (!fs.existsSync(nodejsPath)) {
      // TODO: install nodejs
      this._log.info(
        `Installing nodejs-${newAgentInfo.nodejsVersion} to ${nodejsPath} ...`
      )
    }

    // TODO: install dependencies

    this._npmBuildEnv['PATH'] = `${nodejsPath}/bin:${process.env['PATH']}`
    await Utils.taskAsync(
      `Building agent ${newAgentInfo.version} `,
      this._log,
      async (): Promise<{}> => {
        return this._buildNpmPackage(`${installPath}/agent`)
      }
    )

    await Utils.taskAsync(
      `Building Node-RED`,
      this._log,
      async (): Promise<{}> => {
        return this._buildNpmPackage(`${installPath}/node-red`)
      }
    )

    if (agentInfo.awsiot) {
      await Utils.taskAsync(
        'Building awsiot port',
        this._log,
        async (): Promise<{}> => {
          return this._buildNpmPackage(`${installPath}//ports/awsiot`)
        }
      )
      await Utils.taskAsync(
        'Building awsiot-thing-creator',
        this._log,
        async (): Promise<{}> => {
          return this._buildNpmPackage(
            `${installPath}/tools/awsiot-thing-creator`
          )
        }
      )
    }

    if (agentInfo.pelion) {
      await Utils.taskAsync(
        'Building pelion port ',
        this._log,
        async (): Promise<{}> => {
          return this._buildNpmPackage(`${installPath}//ports/pelion`)
        }
      )
      this._binBuildEnv['PATH'] = `/home/${this._userInfo.user}/.local/bin:${
        process.env['PATH']
      }`
      await Utils.taskAsync(
        'Configuring mbed-cloud-connector',
        this._log,
        async (): Promise<{}> => {
          return this._buildConnector(
            `${installPath}/tools/mbed-cloud-connector`,
            'mbed',
            ['config', 'root', '.']
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
            ['deploy']
          )
        }
      )

      // TODO: dev or factory mode
      /* await Utils.taskAsync( */
      /* 'Deploying mbed-cloud-connector ', */
      /* this._log, */
      /* async (): Promise<{}> => { */
      /* const args = ("pal-platform/pal-platform.py fullbuild --target x86_x64_NativeLinux_mbedtls --toolchain GCC" + */
      /* "--external ./../define.txt --name enebular-agent-mbed-cloud-connector.elf").split(' ') */
      /* console.log(args) */
      /* return this._buildConnector(`${installPath}/tools/mbed-cloud-connector`, 'python', args) */
      /* } */
      /* ) */

      if (agentInfo.mbedCloudConnectorFCC) {
        this._log.info(`Building mbed-cloud-connector-fcc`)
      }
    }

    newAgentInfo = AgentInfo.createFromSrc(installPath)
    this._log.debug('New agent info, after building:')
    this._log.debug(newAgentInfo)
    return newAgentInfo
  }

  public async install(
    cachePath: string,
    installPath: string
  ): Promise<AgentInfo> {
    await Utils.taskAsync(
      'Fetching new agent',
      this._log,
      async (): Promise<boolean> => {
        if (
          !(await this._fetchWithRetry(
            this._config.getString('ENEBULAR_AGENT_DOWNLOAD_URL'),
            cachePath
          ))
        ) {
          throw new Error(`Failed to fetch agent`)
        }
        return true
      }
    )

    await Utils.taskAsync(
      'Extracting new agent',
      this._log,
      async (): Promise<boolean> => {
        await this._extract(cachePath, installPath)
        return true
      }
    )

    return AgentInfo.createFromSrc(installPath)
  }
}
