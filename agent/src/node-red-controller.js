/* @flow */
import fs from 'fs'
import EventEmitter from 'events'
import path from 'path'
import { spawn, type ChildProcess } from 'child_process'
import fetch from 'isomorphic-fetch'
import type { Logger } from 'winston'
import type LogManager from './log-manager'

export type NodeREDConfig = {
  dir: string,
  dataDir: string,
  command: string,
  killSignal: string
}

const moduleName = 'node-red'

type NodeRedFlowPackage = {
  flows: Object[],
  creds: Object,
  packages: Object
}

export default class NodeREDController {
  _dir: string
  _dataDir: string
  _command: string
  _killSignal: string
  _cproc: ?ChildProcess = null
  _actions: Array<() => Promise<any>> = []
  _isProcessing: ?Promise<void> = null
  _log: Logger
  _logManager: LogManager
  _nodeRedLog: Logger

  constructor(
    emitter: EventEmitter,
    log: Logger,
    logManager: LogManager,
    config: NodeREDConfig
  ) {
    this._dir = config.dir
    this._dataDir = config.dataDir
    this._command = config.command
    this._killSignal = config.killSignal

    if (!fs.existsSync(this._dir)) {
      throw new Error(`The Node-RED directory was not found: ${this._dir}`)
    }
    if (!fs.existsSync(this._getDataDir())) {
      throw new Error(
        `The Node-RED data directory was not found: ${this._getDataDir()}`
      )
    }

    this._registerHandler(emitter)

    this._log = log
    this._logManager = logManager
    this._nodeRedLog = logManager.addLogger('service.node-red', [
      'console',
      'enebular',
      'file',
      'syslog'
    ])
  }

  debug(msg: string, ...args: Array<mixed>) {
    args.push({ module: moduleName })
    this._log.debug(msg, ...args)
  }

  info(msg: string, ...args: Array<mixed>) {
    args.push({ module: moduleName })
    this._log.info(msg, ...args)
  }

  _getDataDir() {
    return this._dataDir
  }

  _registerHandler(emitter: EventEmitter) {
    emitter.on('update-flow', params => this.fetchAndUpdateFlow(params))
    emitter.on('deploy', params => this.fetchAndUpdateFlow(params))
    emitter.on('start', () => this.startService())
    emitter.on('restart', () => this.restartService())
    emitter.on('shutdown', () => {
      this.shutdownService()
    })
  }

  async _queueAction(fn: () => Promise<any>) {
    this.debug('Queuing action')
    this._actions.push(fn)
    if (this._isProcessing) {
      await this._isProcessing
    } else {
      await this._processActions()
    }
  }

  async _processActions() {
    this.debug('Processing actions:', this._actions.length)
    this._isProcessing = (async () => {
      while (this._actions.length > 0) {
        const action = this._actions.shift()
        await action()
      }
    })()
    await this._isProcessing
    this._isProcessing = null
  }

  async fetchAndUpdateFlow(params: { downloadUrl: string }) {
    return this._queueAction(() => this._fetchAndUpdateFlow(params))
  }

  async _fetchAndUpdateFlow(params: { downloadUrl: string }) {
    this.info('Updating flow')
    await this._downloadAndUpdatePackage(params.downloadUrl)
    await this._restartService()
  }

  async _downloadAndUpdatePackage(downloadUrl: string) {
    this.info('Downloading flow:', downloadUrl)
    const res = await fetch(downloadUrl)
    if (res.status >= 400) {
      throw new Error('invalid url')
    }
    const body = await res.json()
    return this._updatePackage(body)
  }

  async _updatePackage(flowPackage: NodeRedFlowPackage) {
    this.info('Updating package', flowPackage)
    const updates = []
    if (flowPackage.flow || flowPackage.flows) {
      const flows = flowPackage.flow || flowPackage.flows
      updates.push(
        new Promise((resolve, reject) => {
          const flowFilePath = path.join(this._getDataDir(), 'flows.json')
          fs.writeFile(
            flowFilePath,
            JSON.stringify(flows),
            err => (err ? reject(err) : resolve())
          )
        })
      )
    }
    if (flowPackage.cred || flowPackage.creds) {
      const creds = flowPackage.cred || flowPackage.creds
      updates.push(
        new Promise((resolve, reject) => {
          const credFilePath = path.join(this._getDataDir(), 'flows_cred.json')
          fs.writeFile(
            credFilePath,
            JSON.stringify(creds),
            err => (err ? reject(err) : resolve())
          )
        })
      )
    }
    if (flowPackage.packages) {
      updates.push(
        new Promise((resolve, reject) => {
          const packageJSONFilePath = path.join(
            this._getDataDir(),
            'enebular-agent-dynamic-deps',
            'package.json'
          )
          const packageJSON = JSON.stringify(
            {
              name: 'enebular-agent-dynamic-deps',
              version: '0.0.1',
              dependencies: flowPackage.packages
            },
            null,
            2
          )
          fs.writeFile(
            packageJSONFilePath,
            packageJSON,
            err => (err ? reject(err) : resolve())
          )
        })
      )
    }
    await Promise.all(updates)
    await this._resolveDependency()
  }

  async _resolveDependency() {
    return new Promise((resolve, reject) => {
      const cproc = spawn('npm', ['install', 'enebular-agent-dynamic-deps'], {
        stdio: 'inherit',
        cwd: this._getDataDir()
      })
      cproc.on('error', reject)
      cproc.once('exit', resolve)
    })
  }

  async startService() {
    return this._queueAction(() => this._startService())
  }

  async _startService() {
    this.info('Staring service...')
    return new Promise((resolve, reject) => {
      const [command, ...args] = this._command.split(/\s+/)
      const cproc = spawn(command, args, { stdio: 'pipe', cwd: this._dir })
      cproc.stdout.on('data', data => {
        let str = data.toString().replace(/(\n|\r)+$/, '')
        this._nodeRedLog.info(str)
      })
      cproc.stderr.on('data', data => {
        let str = data.toString().replace(/(\n|\r)+$/, '')
        this._nodeRedLog.error(str)
      })
      cproc.once('exit', code => {
        this.info(`Service exited (${code})`)
        this._cproc = null
        this.startService()
      })
      cproc.once('error', err => {
        this._cproc = null
        reject(err)
      })
      this._cproc = cproc
      setTimeout(() => resolve(), 1000)
    })
  }

  async shutdownService() {
    return this._queueAction(() => this._shutdownService())
  }

  async _shutdownService() {
    return new Promise((resolve, reject) => {
      const cproc = this._cproc
      if (cproc) {
        this.info('Shutting down service...')
        /* remove 'exit' event listener from start service */
        cproc.removeAllListeners('exit')
        cproc.once('exit', () => {
          this.info('Service ended')
          this._cproc = null
          resolve()
        })
        cproc.kill(this._killSignal)
      } else {
        this.info('Service already shutdown')
        resolve()
      }
    })
  }

  async restartService() {
    return this._queueAction(() => this._restartService())
  }

  async _restartService() {
    this.info('Restarting service...')
    await this._shutdownService()
    await this._startService()
  }

  getStatus() {
    if (this._cproc) {
      return 'connected'
    } else {
      return 'disconnected'
    }
  }
}
