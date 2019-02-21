import { execSync, spawn } from 'child_process'
import AgentInfo from './agent-info'
import Config from './config'

export default class Utils {
  public static exec(cmd: string): boolean {
    const { ret } = Utils.execReturnStdout(cmd)
    return ret
  }

  public static execReturnStdout(
    cmd: string
  ): { ret: boolean; stdout?: string } {
    try {
      const stdout = execSync(cmd)
      return { ret: true, stdout: stdout.toString() }
      /* return { ret: true, stdout: "dsad"} */
    } catch (err) {
      return { ret: false }
    }
  }

  public static spawn(
    cmd: string,
    args: string[],
    cwd: string,
    env: NodeJS.ProcessEnv
  ): Promise<{}> {
    return new Promise((resolve, reject) => {
      const cproc = spawn(cmd, args, {
        stdio: 'pipe',
        env: env,
        cwd: cwd
      })
      let stdout = '',
        stderr = ''
      cproc.stdout.on('data', data => {
        stdout = data.toString().replace(/(\n|\r)+$/, '')
      })
      cproc.stderr.on('data', data => {
        stderr = data.toString().replace(/(\n|\r)+$/, '')
      })
      cproc.once('exit', (code, signal) => {
        if (code !== 0) {
          reject(
            new Error(
              `Exited with (${
                code !== null ? code : signal
              })\n stderr:\n${stderr} stdout:\n${stdout}`
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

  public static getSupportedNodeJSVersion(agentVersion: string): string {
    return 'v9.2.1'
  }

  public static dumpAgentInfo(path: string, config?: Config): AgentInfo {
    const info = new AgentInfo()
    info.collectFromSrc(path)
    if (config) info.collectFromSystemdAutoFindUser(config)
    return info
  }

  public static polling(
    callback: () => Promise<boolean>,
    initialDelay: number,
    interval: number,
    timeout: number
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const cb = () => {
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
}
