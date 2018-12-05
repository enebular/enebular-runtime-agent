/* @flow */
import fs from 'fs'
import path from 'path'
import { spawn, type ChildProcess } from 'child_process'
import { LocalConnector } from 'enebular-runtime-agent'

export default class MbedConnector extends LocalConnector {
  _pidFile: string
  _cproc: ?ChildProcess
  _portBasePath: string

  constructor() {
    super()
    this._cproc = null
    this._portBasePath = path.resolve(__dirname, '../')
    this._pidFile = path.resolve(
      this._portBasePath,
      './.mbed_cloud_connector.pid'
    )
  }

  async onConnectorInit() {
    super.onConnectorInit()
    try {
      await this._startMbedCloudConnector()
    } catch (err) {
      console.error(err)
    }
  }

  onConnectorRegisterConfig() {
    super.onConnectorRegisterConfig()
    this._agent.config.addItem(
      'ENEBULAR_MBED_CLOUD_CONNECTOR_STARTUP_COMMAND',
      path.resolve(
        this._portBasePath,
        '../../',
        'tools/mbed-cloud-connector/out/Release/enebular-agent-mbed-cloud-connector.elf'
      ),
      'Mbed cloud connector startup command',
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
      this._log.error(err)
    }
  }

  _removePIDFile() {
    if (!fs.existsSync(this._pidFile)) return

    try {
      fs.unlinkSync(this._pidFile)
    } catch (err) {
      this._log.error(err)
    }
  }

  async _startMbedCloudConnector() {
    this._info('Starting mbed cloud connector...')
    return new Promise((resolve, reject) => {
      if (fs.existsSync(this._pidFile)) {
        // ProcessUtil.killProcessByPIDFile(this._pidFile)
      }

      const startupCommand =
        this._agent.config.get(
          'ENEBULAR_MBED_CLOUD_CONNECTOR_STARTUP_COMMAND'
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
