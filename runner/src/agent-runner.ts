import * as path from 'path'
import { spawn, ChildProcess } from 'child_process'

export default class AgentRunner {
  private _cproc?: ChildProcess

  public constructor()
  {
  }

  private _debug(...args: any[]): void {
    console.info("runner:", ...args)
  }

  private _info(...args: any[]): void {
    console.info(...args)
  }

  public async _startEnebularAgent(): Promise<boolean> {
    this._debug('Starting enebular-agent core...')
    return new Promise((resolve, reject) => {

      const portBasePath = path.resolve(__dirname, '../../ports/awsiot')
      const startupCommand = `${portBasePath}/bin/enebular-awsiot-agent`
      const nodePath = process.execPath

      let args = [`${startupCommand}`, '--start-core']
      if (process.argv.length > 2) {
        args = args.concat(process.argv.slice(2))
      }

      const cproc = spawn(nodePath, args, {
        stdio: 'pipe',
        cwd: portBasePath
      })
      cproc.stdout.on('data', data => {
        this._info(data.toString().replace(/(\n|\r)+$/, ''))
      })
      cproc.stderr.on('data', data => {
        this._info(data.toString().replace(/(\n|\r)+$/, ''))
      })
      cproc.once('exit', (code, signal) => {
      })
      cproc.once('error', err => {
          reject(err)
      })
      this._cproc = cproc
    })
  }

  public startup(): Promise<boolean> {
    if (process.getuid() !== 0) {
      this._debug("Run as non-root user.")
    }
    else {
      this._debug("Run as root user.")
    }
    return this._startEnebularAgent()
  }

  public async shutdown(): Promise<void> {
    if (!this._cproc)
      return

    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve()
      }, 5000)

      if (this._cproc) {
        this._cproc.once('exit', (code, signal) => {
          this._info('enebular-agent has terminated.')
          resolve()
        })
      }
    })
  }
}
  
