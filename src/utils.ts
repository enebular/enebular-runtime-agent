import * as fs from 'fs'
import * as path from 'path'

import { execSync, spawn } from 'child_process'
import AgentInfo from './agent-info'
import Log from './log'

export interface UserInfo {
  user: string
  gid: number
  uid: number
}

export default class Utils {
  public static exec(cmd: string): boolean {
    return Utils.execReturnStdout(cmd) == undefined ? false : true
  }

  public static execReturnStdout(cmd: string): string | undefined {
    try {
      const stdout = execSync(cmd)
      return stdout.toString()
    } catch (err) {
      return undefined
    }
  }

  public static spawn(
    cmd: string,
    args: string[],
    log: Log,
    options?: {
      cwd?: string
      env?: NodeJS.ProcessEnv
      uid?: number
      gid?: number
    }
  ): Promise<{}> {
    return new Promise((resolve, reject) => {
      const ops = options
        ? Object.assign({ stdio: 'pipe' }, options)
        : { stdio: 'pipe' }
      const cproc = spawn(cmd, args, ops)
      let stdout = '',
        stderr = ''
      cproc.stdout.on('data', data => {
        stdout = data.toString().replace(/(\n|\r)+$/, '')
        log.debug(stdout)
      })
      cproc.stderr.on('data', data => {
        stderr = data.toString().replace(/(\n|\r)+$/, '')
        log.debug(stderr)
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

  public static getSupportedNodeJSVersion(agentVersion: string): string {
    return 'v9.2.1'
  }

  public static dumpAgentInfo(path: string, user?: string): AgentInfo {
    return user
      ? AgentInfo.createFromSystemd(user)
      : AgentInfo.createFromSrc(path)
  }

  public static polling(
    callback: () => Promise<boolean>,
    initialDelay: number,
    interval: number,
    timeout: number
  ): Promise<boolean> {
    return new Promise(resolve => {
      const cb = (): void => {
        const intervalObj = setInterval(async () => {
          if (await callback()) {
            clearInterval(intervalObj)
            resolve(true)
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
    cb: () => Promise<boolean> | Promise<{}>
  ): Promise<boolean> {
    log.info(name)
    try {
      await cb()
      log.info('\x1b[32mOK\x1b[0m')
    } catch (err) {
      log.info('\x1b[31mFailed\x1b[0m')
      throw err
    }
    return true
  }

  public static task(name: string, log: Log, cb: () => boolean): void {
    log.info(name)
    try {
      cb()
      log.info('\x1b[32mOK\x1b[0m')
    } catch (err) {
      log.info('\x1b[31mFailed\x1b[0m')
      throw err
    }
  }

  public static mkdirp(
    log: Log,
    path: string,
    userInfo?: UserInfo
  ): Promise<{}> {
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
  ): Promise<{}> {
    if (!src || !dst) {
      throw new Error(`src (${src}) and dst (${dst}) must be set`)
    }
    if (!fs.existsSync(src)) {
      throw new Error(`Failed to find config: ${src}`)
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
}
