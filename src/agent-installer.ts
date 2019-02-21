import * as fs from 'fs'
import * as path from 'path'
import * as util from 'util'
import * as rimraf from 'rimraf'
import checkDiskSpace from 'check-disk-space'
import request from 'request'
import progress from 'request-progress'
import tar from 'tar'
import { spawn } from 'child_process'

import Config from './config'
import AgentInfo from './agent-info'
import Utils from './utils'
import Log from './log'

export default class AgentInstaller {
  private _config: Config
  private _minimumRequiredDiskSpace: number = 400 * 1024 * 1024 // 400 MiB
  private _maxFetchRetryCount: number = 3
  private _fetchRetryCount: number = 0
  private _buildEnv: NodeJS.ProcessEnv = {}
  private _log: Log

  public constructor(config: Config, log: Log) {
    this._config = config
    this._log = log
  }

  private _download(url: string, path: string): Promise<{}> {
    const onProgress = (state): void => {
      this._log.info(
        util.format(
          'Download progress: %f%% @ %fKB/s, %fsec',
          state.percent ? Math.round(state.percent * 100) : 0,
          state.speed ? Math.round(state.speed / 1024) : 0,
          state.time.elapsed ? Math.round(state.time.elapsed) : 0
        )
      )
    }
    this._log.info(`Downloading ${url} to ${path} ...`)
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
          console.log(
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

  private async _fetch(url: string, path: string) {
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
      await tar.t({
        /* file: "/home/suyouxin/enebular-agent-latest-broken.tar.gz", */
        file: path,
        strict: true,
        gzip: true
      })
    } catch (err) {
      throw new Error(`Tarball integrity check failed: ${path}\n${err.message}`)
    }
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
          this._log.info(
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

  private _extract(tarball: string, dst: string) {
    try {
      if (fs.existsSync(dst)) {
        rimraf.sync(dst)
      }
      fs.mkdirSync(dst)
    } catch (err) {
      throw new Error(`Failed to create agent directory:\n${err.message}`)
    }

    this._log.info(`Extracting ${tarball} to ${dst} ...`)

    return tar.x({
      file: tarball,
      C: dst,
      strip: 1,
      strict: true,
      gzip: true
    })
  }

  private _buildNpmPackage(path: string): Promise<{}> {
    return Utils.spawn('npm', ['i'], path, this._buildEnv)
  }

  private async _build(
    agentInfo: AgentInfo,
    installPath: string
  ): Promise<boolean> {
    this._log.debug('Current agent info:')
    this._log.debug(agentInfo)
    let newAgentInfo = new AgentInfo()
    newAgentInfo.collectFromSrc(installPath)
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
    this._buildEnv['PATH'] = `${nodejsPath}/bin:${process.env['PATH']}`
    this._log.info(`Building agent ...`)
    await this._buildNpmPackage(`${installPath}/agent`)

    if (agentInfo.awsiot) {
      this._log.info(`Building awsiot port ...`)
      await this._buildNpmPackage(`${installPath}//ports/awsiot`)
      this._log.info(`Building awsiot-thing-creator port ...`)
      await this._buildNpmPackage(`${installPath}/tools/awsiot-thing-creator`)
    }
    if (agentInfo.pelion) {
      this._log.info(`Building pelion port ...`)
      await this._buildNpmPackage(`${installPath}//ports/pelion`)
      this._log.info(`Building mbed-cloud-connector ...`)
      if (agentInfo.mbedCloudConnectorFCC) {
        this._log.info(`Building mbed-cloud-connector-fcc ...`)
      }
    }

    newAgentInfo.collectFromSrc(installPath)
    this._log.debug('New agent info, after building:')
    this._log.debug(newAgentInfo)
    return true
  }

  public async install(
    agentInfo: AgentInfo,
    cachePath: string,
    installPath: string
  ): Promise<boolean> {
    const tarball = cachePath + '/enebular-agent-latest.tar.gz'
    if (
      !(await this._fetchWithRetry(
        this._config.getString('ENEBULAR_AGENT_DOWNLOAD_URL'),
        tarball
      ))
    ) {
      this._log.error(`Failed to fetch agent`)
      return false
    }

    try {
      await this._extract(tarball, installPath)
    } catch (err) {
      this._log.error(`Failed to extract agent:\n${err.message}`)
      return false
    }

    try {
      await this._build(agentInfo, installPath)
    } catch (err) {
      this._log.error(`Failed to build agent:\n${err.message}`)
      return false
    }
    return true
  }
}
