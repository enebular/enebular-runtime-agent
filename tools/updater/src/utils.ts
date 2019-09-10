import * as fs from 'fs'
import * as path from 'path'
import fetch from 'isomorphic-fetch'

import { execSync, spawn } from 'child_process'
import Log from './log'

export interface UserInfo {
  user: string
  gid: number
  uid: number
}

export class Utils {
  /**
   * HTTP request with JSON response
   *
   * This makes a HTTP request with a JSON response and provides
   * consistent error handling of that response.
   *
   * @param  {string} url     Fetch URL
   * @param  {Object} options Fetch options
   * @return {Object}         The fetched JSON
   */
  public static async fetchJSON(url, options): Promise<Record<string, any>> {
    options = Object.assign({}, options)
    options.headers = Object.assign(options.headers || {}, {
      Accept: 'application/json'
    })

    const res = await fetch(url, options)
    if (!res.ok) {
      let msg = `Failed response (${res.status} ${res.statusText})`
      let details
      try {
        const resJson = await res.json()
        details = resJson.message ? resJson.message : JSON.stringify(resJson)
      } catch (err) {
        details = 'No error details available'
      }
      msg += ' - ' + details
      throw new Error(msg)
    }

    try {
      const resJson = await res.json()
      return resJson
    } catch (err) {
      throw new Error('Response did not contain JSON')
    }
  }

  public static exec(cmd: string): boolean {
    return Utils.execReturnStdout(cmd) == undefined ? false : true
  }

  public static execReturnStdout(cmd: string): string | undefined {
    try {
      return execSync(cmd).toString()
    } catch (err) {
      return undefined
    }
  }

  public static spawn(
    cmd: string,
    args: string[],
    log?: Log,
    options?: {
      cwd?: string
      env?: NodeJS.ProcessEnv
      uid?: number
      gid?: number
    }
  ): Promise<void> {
    return new Promise((resolve, reject): void => {
      const ops = options
        ? Object.assign({ stdio: 'pipe' }, options)
        : { stdio: 'pipe' }
      const cproc = spawn(cmd, args, ops)
      let stdout = '',
        stderr = ''
      cproc.stdout.on('data', (data): void => {
        stdout = data.toString().replace(/(\n|\r)+$/, '')
        if (log) log.debug(stdout)
      })
      cproc.stderr.on('data', (data): void => {
        stderr = data.toString().replace(/(\n|\r)+$/, '')
        if (log) log.debug(stderr)
      })
      cproc.once('exit', (code, signal): void => {
        if (code !== 0) {
          let stdio = ''
          stdio += stderr ? `stderr:\n${stderr}` : ''
          stdio += stdout ? `stdout:\n${stdout}` : ''
          reject(
            new Error(
              `Exited with (${code !== null ? code : signal})\n${stdio}`
            )
          )
        } else {
          resolve()
        }
      })
      cproc.once('error', (err): void => {
        reject(err)
      })
    })
  }

  public static getUserInfo(user: string): UserInfo {
    let ret = Utils.execReturnStdout(`id -u ${user}`)
    if (!ret) {
      throw new Error('Failed to get user uid')
    }
    const uid = parseInt(ret)
    ret = Utils.execReturnStdout(`id -u ${user}`)
    if (!ret) {
      throw new Error('Failed to get user gid')
    }
    const gid = parseInt(ret)
    return {
      user: user,
      gid: gid,
      uid: uid
    }
  }

  public static polling(
    callback: () => Promise<boolean>,
    initialDelay: number,
    interval: number,
    timeout: number
  ): Promise<boolean> {
    return new Promise((resolve, reject): void => {
      const cb = (): void => {
        const intervalObj = setInterval(async (): Promise<void> => {
          try {
            if (await callback()) {
              clearInterval(intervalObj)
              resolve(true)
            }
          } catch (err) {
            reject(err)
          }
        }, interval)
        setTimeout((): void => {
          clearInterval(intervalObj)
          resolve(false)
          // max waiting time
        }, timeout)
      }
      if (initialDelay) {
        setTimeout(cb, initialDelay)
      } else {
        cb()
      }
    })
  }

  public static randomString(): string {
    return Math.random()
      .toString(36)
      .substr(2, 10)
  }

  public static async taskAsync(
    name: string,
    log: Log,
    cb: () => Promise<boolean> | Promise<{}> | Promise<void>,
    ignore = false
  ): Promise<void> {
    log.info(`==== ${name} ====`)
    try {
      await cb()
      log.info(Utils.echoGreen('OK'))
    } catch (err) {
      log.debug(`task ${name} failed, reason: ${err.message}`)
      if (ignore) {
        log.info(Utils.echoYellow('N/A'))
      } else {
        log.info(Utils.echoRed('Failed'))
        throw err
      }
    }
  }

  public static task(
    name: string,
    log: Log,
    cb: () => void,
    ignore = false
  ): void {
    log.info(`==== ${name} ====`)
    try {
      cb()
      log.info(Utils.echoGreen('OK'))
    } catch (err) {
      log.debug(`task ${name} failed, reason: ${err.message}`)
      if (ignore) {
        log.info(Utils.echoYellow('N/A'))
      } else {
        log.info(Utils.echoRed('Failed'))
        throw err
      }
    }
  }

  public static echoColor(str: string, color: string): string {
    return `\x1b[${color}m${str}\x1b[0m`
  }

  public static echoGreen(str: string): string {
    return Utils.echoColor(str, '32')
  }

  public static echoRed(str: string): string {
    return Utils.echoColor(str, '31')
  }

  public static echoYellow(str: string): string {
    return Utils.echoColor(str, '33')
  }

  public static mkdirp(
    log: Log,
    path: string,
    userInfo?: UserInfo
  ): Promise<void> {
    return Utils.spawn(
      'mkdir',
      ['-p', path],
      log,
      userInfo
        ? {
            uid: userInfo.uid,
            gid: userInfo.gid
          }
        : {}
    )
  }

  public static chown(
    log: Log,
    path: string,
    userInfo: UserInfo
  ): Promise<void> {
    return Utils.spawn(
      'chown',
      ['-R', `${userInfo.uid}:${userInfo.gid}`, path],
      log
    )
  }

  public static async copy(
    log: Log,
    src?: string,
    dst?: string,
    userInfo?: UserInfo
  ): Promise<void> {
    if (!src || !dst) {
      throw new Error(
        `Failed to copy, src (${src}) and dst (${dst}) must be set`
      )
    }
    if (!fs.existsSync(src)) {
      throw new Error(`Failed to find: ${src}`)
    }
    if (src == dst) return

    const parentDir = path.resolve(dst, '../')
    if (!fs.existsSync(parentDir)) {
      await Utils.mkdirp(log, parentDir, userInfo)
    }
    const args = [src, dst]
    if (fs.lstatSync(src).isDirectory()) {
      args.unshift('-rT')
    }
    return Utils.spawn(
      'cp',
      args,
      log,
      userInfo
        ? {
            uid: userInfo.uid,
            gid: userInfo.gid
          }
        : {}
    )
  }

  public static mv(
    from: string,
    to: string,
    log?: Log,
    userInfo?: UserInfo
  ): Promise<void> {
    return Utils.spawn(
      'mv',
      [from, to],
      log,
      userInfo
        ? {
            uid: userInfo.uid,
            gid: userInfo.gid
          }
        : {}
    )
  }
}

export default Utils
