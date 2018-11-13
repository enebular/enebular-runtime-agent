/* @flow */
import fs from 'fs'
import path from 'path'
import { spawn, type ChildProcess } from 'child_process'
import { LocalPort } from 'enebular-runtime-agent'

class MbedPort extends LocalPort {
  _pidFile: string
  _cproc: ?ChildProcess

  constructor() {
    super()
    this._cproc = null
    this._pidFile = './.mbed_clould_connector.pid'
  }

  onConnectorRegisterConfig() {
    super.onConnectorRegisterConfig()
    const mbedCloudConnectorStartupCommand =
      'ENEBULAR_MBED_CLOUD_CONNECTOR_STARTUP_COMMAND'
    const defaultMbedCloudConnectorStartupCommand =
      path.resolve(
        process.argv[1],
        '../../../../',
        'tools/mbed_cloud_connector/out/Release/enebular-agent-mbed-cloud-connector.elf'
      ) + ' -c -d'

    this._agent.config.addItem(
      mbedCloudConnectorStartupCommand,
      defaultMbedCloudConnectorStartupCommand,
      'Mbed cloud connector startup command',
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
        ' -s ' +
        this._agent.config.get('ENEBULAR_LOCAL_PORT_SOCKET_PATH')

      this._info('Mbed cloud connector startup command: ' + startupCommand)

      const [command, ...args] = startupCommand.split(/\s+/)
      const cproc = spawn(command, args, {
        stdio: 'pipe'
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
    await super.startup(path.resolve(__dirname, '../'))
    try {
      await this._startMbedCloudConnector()
    } catch (err) {
      console.error(err)
    }
  }

  async shutdown() {
    try {
      await this._stopMbedCloudConnector()
    } catch (err) {
      console.error(err)
    }
    await super.shutdown()
  }
}

const mbedPort = new MbedPort()

async function startup() {
  await mbedPort.startup()
}

async function shutdown() {
  await mbedPort.shutdown()
}

async function exit() {
  await shutdown()
  process.exit(0)
}

if (require.main === module) {
  startup()
  process.on('SIGINT', () => {
    exit()
  })
  process.on('SIGTERM', () => {
    exit()
  })
  process.on('uncaughtException', err => {
    console.error(`Uncaught exception: ${err.stack}`)
    process.exit(1)
  })
}

export { startup, shutdown }
