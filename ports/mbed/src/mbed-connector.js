/* @flow */
import fs from 'fs'
import path from 'path'
import { spawn, type ChildProcess } from 'child_process'
import { LocalConnector, ProcessUtil } from 'enebular-runtime-agent'

export default class MbedConnector extends LocalConnector {
  _pidFile: string
  _cproc: ?ChildProcess
  _portBasePath: string
  _retryCount: number
  _lastRetryTimestamp: number

  constructor() {
    super()
    this._moduleName = 'mbed'
    this._retryCount = 0
    this._lastRetryTimestamp = Date.now()
    this._cproc = null
    this._portBasePath = path.resolve(__dirname, '../')
    this._pidFile = path.resolve(
      this._portBasePath,
      './.mbed_cloud_connector.pid'
    )
  }

  async onConnectorInit() {
    super.onConnectorInit()
    await this._startMbedCloudConnector()
  }

  onConnectorRegisterConfig() {
    super.onConnectorRegisterConfig()
    this._agent.config.addItem(
      'ENEBULAR_MBED_CLOUD_CONNECTOR_EXECUTABLE_FILE',
      path.resolve(
        this._portBasePath,
        '../../',
        'tools/mbed-cloud-connector/out/Release/enebular-agent-mbed-cloud-connector.elf'
      ),
      'Mbed cloud connector executable file',
      true
    )
    this._agent.config.addItem(
      'ENEBULAR_MBED_CLOUD_CONNECTOR_DATA_PATH',
      path.resolve(this._portBasePath, '../../', 'tools/mbed-cloud-connector'),
      'Mbed cloud connector data path',
      true
    )
  }

  _createPIDFile(pid: string) {
    try {
      fs.writeFileSync(this._pidFile, pid, 'utf8')
    } catch (err) {
      this._error(err)
    }
  }

  _removePIDFile() {
    if (!fs.existsSync(this._pidFile)) return

    try {
      fs.unlinkSync(this._pidFile)
    } catch (err) {
      this._error(err)
    }
  }

  async _startMbedCloudConnector() {
    this._info('Starting mbed cloud connector...')
    return new Promise((resolve, reject) => {
      if (fs.existsSync(this._pidFile)) {
        ProcessUtil.killProcessByPIDFile(this._pidFile)
      }

      const startupCommand =
        this._agent.config.get(
          'ENEBULAR_MBED_CLOUD_CONNECTOR_EXECUTABLE_FILE'
        ) +
        ' -c -d -s ' +
        this._agent.config.get('ENEBULAR_LOCAL_PORT_SOCKET_PATH')

      this._info('Mbed cloud connector startup command: ' + startupCommand)

      const [command, ...args] = startupCommand.split(/\s+/)
      const cproc = spawn(command, args, {
        stdio: 'pipe',
        cwd: this._agent.config.get('ENEBULAR_MBED_CLOUD_CONNECTOR_DATA_PATH')
      })
      cproc.stdout.on('data', data => {
        let str = data.toString().replace(/(\n|\r)+$/, '')
        this._info(str)
      })
      cproc.stderr.on('data', data => {
        let str = data.toString().replace(/(\n|\r)+$/, '')
        this._error(str)
      })
      cproc.once('exit', (code, signal) => {
        this._info(
          `mbed cloud connector exited (${code !== null ? code : signal})`
        )
        this._cproc = null
        if (code !== 0) {
          let shouldRetry
          ;[
            shouldRetry,
            this._retryCount,
            this._lastRetryTimestamp
          ] = ProcessUtil.shouldRetryOnCrash(
            this._retryCount,
            this._lastRetryTimestamp
          )

          if (shouldRetry) {
            this._info(
              `Unexpected exit, restarting service in 1 second. Retry count: ${
                this._retryCount
              }`
            )
            setTimeout(() => {
              this._startMbedCloudConnector()
            }, 1000)
          } else {
            this._info(
              `Unexpected exit, but retry count(${
                this._retryCount
              }) exceed max.`
            )
          }
        }
        this._removePIDFile()
      })
      cproc.once('error', err => {
        this._cproc = null
        reject(err)
      })
      this._cproc = cproc
      if (this._cproc.pid) this._createPIDFile(this._cproc.pid.toString())
      setTimeout(() => resolve(), 1000)
    })
  }

  async _stopMbedCloudConnector() {
    return new Promise((resolve, reject) => {
      const cproc = this._cproc
      if (cproc) {
        this._info('Stopping mbed cloud connector...')
        cproc.once('exit', () => {
          this._info('mbed cloud connector ended')
          this._cproc = null
          resolve()
        })
        cproc.kill('SIGINT')
      } else {
        resolve()
      }
    })
  }

  async startup() {
    return super.startup(this._portBasePath)
  }

  async shutdown() {
    try {
      await this._stopMbedCloudConnector()
    } catch (err) {
      console.error(err)
    }
    return super.shutdown()
  }
}
