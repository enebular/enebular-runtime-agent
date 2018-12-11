/* @flow */
import fs from 'fs'
import path from 'path'
import { spawn, type ChildProcess } from 'child_process'
import { LocalConnector, ProcessUtil, type RetryInfo } from 'enebular-runtime-agent'

export default class PelionConnector extends LocalConnector {
  _pidFile: string
  _cproc: ?ChildProcess
  _portBasePath: string
  _retryInfo: RetryInfo

  constructor() {
    super()
    this._moduleName = 'pelion'
    this._retryInfo = { retryCount: 0, lastRetryTimestamp: Date.now() }
    this._cproc = null
    this._portBasePath = path.resolve(__dirname, '../')
    this._pidFile = path.resolve(this._portBasePath, './.pelion_connector.pid')
  }

  async onConnectorInit() {
    super.onConnectorInit()
    await this._startPelionConnector()
  }

  onConnectorRegisterConfig() {
    super.onConnectorRegisterConfig()
    this._agent.config.addItem(
      'ENEBULAR_PELION_CONNECTOR_PATH',
      path.resolve(
        this._portBasePath,
        '../../',
        'tools/mbed-cloud-connector/out/Release/enebular-agent-mbed-cloud-connector.elf'
      ),
      'Pelion connector executable file',
      true
    )
    this._agent.config.addItem(
      'ENEBULAR_PELION_CONNECTOR_DATA_PATH',
      path.resolve(this._portBasePath, './.pelion-connector/'),
      'Pelion cloud connector data path',
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

  async _startPelionConnector() {
    this._info('Starting pelion connector...')
    return new Promise((resolve, reject) => {
      if (fs.existsSync(this._pidFile)) {
        ProcessUtil.killProcessByPIDFile(this._pidFile)
      }

      const startupCommand =
        this._agent.config.get('ENEBULAR_PELION_CONNECTOR_PATH') +
        ' -s ' +
        this._agent.config.get('ENEBULAR_LOCAL_CONNECTOR_SOCKET_PATH')

      this._info('Pelion connector startup command: ' + startupCommand)

      const dataPath = this._agent.config.get(
        'ENEBULAR_PELION_CONNECTOR_DATA_PATH'
      )
      try {
        if (!fs.existsSync(dataPath)) {
          fs.mkdirSync(dataPath)
        }
      } catch (err) {
        this._error('Failed to create connector data directory: ' + err)
      }

      const [command, ...args] = startupCommand.split(/\s+/)
      const cproc = spawn(command, args, {
        stdio: 'pipe',
        cwd: dataPath
      })
      cproc.stdout.on('data', data => {
        let str = data.toString().replace(/(\n|\r)+$/, '')
        this._info('conntector: ' + str)
      })
      cproc.stderr.on('data', data => {
        let str = data.toString().replace(/(\n|\r)+$/, '')
        this._error('conntector: ' + str)
      })
      cproc.once('exit', (code, signal) => {
        this._info(`pelion connector exited (${code !== null ? code : signal})`)
        this._cproc = null
        if (code !== 0) {
          let shouldRetry = ProcessUtil.shouldRetryOnCrash(this._retryInfo)
          if (shouldRetry) {
            this._info(
              `Unexpected exit, restarting service in 1 second. Retry count: ${
                this._retryInfo.retryCount
              }`
            )
            setTimeout(() => {
              this._startPelionConnector()
            }, 1000)
          } else {
            this._info(
              `Unexpected exit, but retry count(${
                this._retryInfo.retryCount
              }) exceed max.`
            )
            throw new Error('Failed to start pelion connector.')
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

  async _stopPelionConnector() {
    return new Promise((resolve, reject) => {
      const cproc = this._cproc
      if (cproc) {
        this._info('Stopping pelion connector...')
        cproc.once('exit', () => {
          this._info('pelion connector ended')
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
      await this._stopPelionConnector()
    } catch (err) {
      console.error(err)
    }
    return super.shutdown()
  }
}
