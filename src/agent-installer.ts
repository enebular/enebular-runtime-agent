import * as fs from 'fs'
import * as path from 'path'
import * as util from 'util'
import * as rimraf from 'rimraf'
import checkDiskSpace from 'check-disk-space'
import request from 'request'
import progress from 'request-progress'
import tar from 'tar'

import Config from './config'
import { AgentInfo } from './agent-updater'

export default class AgentInstaller {
  private _config: Config
  private _minimumRequiredDiskSpace: number = 400 * 1024 * 1024 // 400 MiB
  private _maxFetchRetryCount: number = 3
  private _fetchRetryCount: number = 0

  public constructor(config: Config) {
    this._config = config
  }

  private _download(url: string, path: string): Promise<string> {
    const onProgress = (state): void => {
      console.log(
        util.format(
          'Download progress: %f%% @ %fKB/s, %fsec',
          state.percent ? Math.round(state.percent * 100) : 0,
          state.speed ? Math.round(state.speed / 1024) : 0,
          state.time.elapsed ? Math.round(state.time.elapsed) : 0
        )
      )
    }
    console.log(`Downloading ${url} to ${path} ...`)
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
      await tar.t({
        /* file: "/home/suyouxin/enebular-agent-latest-broken.tar.gz", */
        file: path,
        strict: true,
        gzip: true
      })
    } catch (err) {
      throw new Error(`Tarball integrity check failed: ${path}\n${err.message}`)
    }
    return true
  }

  public async _fetchWithRetry(url: string, path: string): Promise<boolean> {
    return new Promise(async (resolve, reject) => {
      try {
        await this._fetch(url, path)
        this._fetchRetryCount = 0
        resolve(true)
      } catch (err) {
        this._fetchRetryCount++
        if (this._fetchRetryCount <= this._maxFetchRetryCount) {
          console.log(`Failed to fetch agent, retry in 1 second ...\n${err.message}`)
          setTimeout(async () => {
            resolve(await this._fetchWithRetry(url, path))
          }, 1000)
        }
        else {
          this._fetchRetryCount = 0
          console.log(`Failed to to fetch agent, retry count(${this._maxFetchRetryCount}) reaches max\n${err.message}`)
          resolve(false)
        }
      }
    })
  }

  private _extract(tarball: string, dst: string): Promise<boolean> {
    try {
      if (fs.existsSync(dst)) {
        rimraf.sync(dst)
      }
      fs.mkdirSync(dst)
    } catch (err) {
      throw new Error(`Failed to create agent directory:\n${err.message}`)
    }

    console.log(`Extracting ${tarball} to ${dst} ...`)

    return tar.x({
      file: tarball,
      C: dst,
      strip: 1,
      strict: true,
      gzip: true
    })
  }

  private _build(agentInfo: AgentInfo, installPath: string): Promise<boolean> {
    console.log(`Building agent ...`)
    if (agentInfo.awsiot) {
      console.log(`Building awsiot port ...`)
      console.log(`Building awsiot-thing-creator port ...`)
    }
    if (agentInfo.pelion) {
      console.log(`Building pelion port ...`)
      console.log(`Building mbed-cloud-connector ...`)
      if (agentInfo.mbedCloudConnectorFCC) {
        console.log(`Building mbed-cloud-connector-fcc ...`)
      }
    }
    return true
  }

  public async install(
    agentInfo: AgentInfo,
    cachePath: string,
    installPath: string
  ): Promise<boolean> {
    const tarball = cachePath + '/enebular-agent-latest.tar.gz'
    if (!await this._fetchWithRetry(
      this._config.getString('ENEBULAR_AGENT_DOWNLOAD_URL'),
      tarball
    )) {
      throw new Error(`Failed to fetch agent`)
    }

    try {
      await this._extract(tarball, installPath)
    } catch (err) {
      throw new Error(`Failed to extract agent:\n${err.message}`)
    }
    return true
  }
}
