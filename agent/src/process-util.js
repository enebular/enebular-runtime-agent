/* @flow */
import fs from 'fs'

export default class ProcessUtil {
  static processIsAlive(pid: number) {
    try {
      process.kill(pid, 0)
      return true
    } catch (err) {
      return false
    }
  }

  _waitForProcessToDie(pid: number) {
    return new Promise((resolve, reject) => {
      let timeout
      const timer = setInterval(() => {
        if (ProcessUtil.processIsAlive(pid) === false) {
          // console.log('pid=%d process killed', pid)
          clearTimeout(timeout)
          clearInterval(timer)
          resolve()
        }
      }, 100)
      timeout = setTimeout(() => {
        clearInterval(timer)
        reject(new Error('timeout to kill process.'))
      }, 1000)
    })
  }

  static async killProcess(pid: number) {
    try {
      process.kill(pid, 'SIGTERM')
      await ProcessUtil._waitForProcessToDie(pid)
    } catch (err) {
      console.error('%s pid can not be killed', pid, err.stack, err.message)
    }
  }

  static killProcessByPIDFile(pidFileName: string) {
    if (!fs.existsSync(pidFileName)) {
      console.error("Can't find pid file " + pidFileName)
      return
    }

    try {
      const pid = fs.readFileSync(pidFileName)
      ProcessUtil.killProcess(parseInt(pid))
    } catch (err) {
      console.error(err)
    }
  }
}
