import * as fs from 'fs'
import * as path from 'path'

import { execSync, spawn } from 'child_process'
import Log from './log'

export interface UserInfo {
  user: string
  gid: number
  uid: number
}

export class Utils {
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
    return new Promise((resolve, reject) => {
      const ops = options
        ? Object.assign({ stdio: 'pipe' }, options)
        : { stdio: 'pipe' }
      const cproc = spawn(cmd, args, ops)
      let stdout = '',
        stderr = ''
      cproc.stdout.on('data', data => {
        stdout = data.toString().replace(/(\n|\r)+$/, '')
        if (log) log.debug(stdout)
      })
      cproc.stderr.on('data', data => {
        stderr = data.toString().replace(/(\n|\r)+$/, '')
        if (log) log.debug(stderr)
      })
      cproc.once('exit', (code, signal) => {
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
      cproc.once('error', err => {
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
    return new Promise((resolve, reject) => {
      const cb = (): void => {
        const intervalObj = setInterval(async () => {
          try {
            if (await callback()) {
              clearInterval(intervalObj)
              resolve(true)
            }
          } catch (err) {
            reject(err)
          }
        }, interval)
        setTimeout(async () => {
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

    const parentDir = path.resolve(dst, '../')
    if (!fs.existsSync(parentDir)) {
      await Utils.mkdirp(log, parentDir, userInfo)
    }
    let args = [src, dst]
    if (fs.lstatSync(src).isDirectory()) {
      args.unshift('-r')
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
