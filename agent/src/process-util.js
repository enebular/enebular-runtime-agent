/* @flow */
import fs from 'fs'

const maxRetryCount = 5
const maxRetryCountResetInterval = 20

export type RetryInfo = {
  retryCount: number,
  lastRetryTimestamp: number
}

export default class ProcessUtil {
  static processIsAlive(pid: number) {
    try {
      process.kill(pid, 0)
      return true
    } catch (err) {
      return false
    }
  }

  static _waitForProcessToDie(pid: number) {
    return new Promise((resolve, reject) => {
      let timeout
      const timer = setInterval(() => {
        if (ProcessUtil.processIsAlive(pid) === false) {
          // console.log('pid=%d process killed', pid)
          clearTimeout(timeout)
          clearInterval(timer)
          resolve(true)
        }
      }, 100)
      timeout = setTimeout(() => {
        clearInterval(timer)
        console.error('timeout to kill process.')
        resolve(false)
      }, 3000)
    })
  }

  static killProcess(pid: number): Promise {
    try {
      process.kill(pid, 'SIGTERM')
    } catch (err) {
      console.error('%s pid can not be killed', pid)
    }
    return ProcessUtil._waitForProcessToDie(pid)
  }

  static async killProcessByPIDFile(pidFileName: string): boolean {
    let ret = false
    if (!fs.existsSync(pidFileName)) {
      console.error("Can't find pid file " + pidFileName)
      return ret
    }

    try {
      const pid = fs.readFileSync(pidFileName)
      ret = await ProcessUtil.killProcess(parseInt(pid))
    } catch (err) {
      console.error(err)
    }
    return ret
  }

  static shouldRetryOnCrash(retryInfo: RetryInfo): boolean {
    const now = Date.now()
    /* Detect continuous crashes (exceptions happen within maxRetryCountResetInterval seconds). */
    retryInfo.retryCount =
      retryInfo.lastRetryTimestamp + maxRetryCountResetInterval * 1000 > now
        ? retryInfo.retryCount + 1
        : 0
    retryInfo.lastRetryTimestamp = now
    return retryInfo.retryCount <= maxRetryCount
  }
}
