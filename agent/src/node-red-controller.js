/* @flow */
import fs from 'fs'
import EventEmitter from 'events'
import path from 'path'
import { spawn, type ChildProcess } from 'child_process'
import fetch from 'isomorphic-fetch'
import type { Logger } from 'winston'
import rimraf from 'rimraf'
import ProcessUtil, { type RetryInfo } from './process-util'
import type LogManager from './log-manager'
import {
  encryptCredential,
  fsWriteFileAsync,
  fsReadFileAsync,
  fsCopyFileAsync,
  mkdirAsync,
  unlinkAsync,
  symlinkAsync,
  mkdirpAsync,
  createNodeDefinition
} from './utils'

export type NodeREDConfig = {
  dir: string,
  dataDir: string,
  command: string,
  killSignal: string,
  pidFile: string,
  assetsDataPath: string
}

const moduleName = 'node-red'

type EditSession = {
  ipAddress: string,
  sessionToken: string
}

type NodeRedFlowPackage = {
  flows: Object[],
  creds: Object,
  packages: Object,
  editSession?: EditSession
}

export default class NodeREDController {
  _dir: string
  _dataDir: string
  _aiNodesDir: string
  _command: string
  _killSignal: string
  _pidFile: string
  _assetsDataPath: string
  _cproc: ?ChildProcess = null
  _actions: Array<() => Promise<any>> = []
  _isProcessing: ?Promise<void> = null
  _log: Logger
  _logManager: LogManager
  _nodeRedLog: Logger
  _retryInfo: RetryInfo
  _allowEditSessions: boolean = false

  constructor(
    emitter: EventEmitter,
    log: Logger,
    logManager: LogManager,
    config: NodeREDConfig
  ) {
    this._dir = config.dir
    this._dataDir = config.dataDir
    this._aiNodesDir = config.aiNodesDir
    this._command = config.command
    this._killSignal = config.killSignal
    this._pidFile = config.pidFile
    this._assetsDataPath = config.assetsDataPath
    this._allowEditSessions = config.allowEditSessions
    this._retryInfo = { retryCount: 0, lastRetryTimestamp: Date.now() }

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

  error(msg: string, ...args: Array<mixed>) {
    args.push({ module: moduleName })
    this._log.error(msg, ...args)
  }

  _getDataDir() {
    return this._dataDir
  }

  _getAiNodesDir() {
    return this._aiNodesDir
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

    const flowPackage = await this._downloadPackage(params.downloadUrl)
    let editSessionRequested = this._flowPackageContainsEditSession(flowPackage)
    if (editSessionRequested && !this._allowEditSessions) {
      this.info('Edit session flow deploy requested but not allowed')
      this.info('Start agent in --dev-mode to allow edit session.')
      return
    }

    await this._updatePackage(flowPackage)
    if (editSessionRequested) {
      await this._restartInEditorMode(flowPackage.editSession)
    } else {
      await this._restartService()
    }
  }

  _flowPackageContainsEditSession(flowPackage: NodeRedFlowPackage) {
    if (
      flowPackage &&
      flowPackage.editSession &&
      flowPackage.editSession.ipAddress &&
      flowPackage.editSession.sessionToken
    ) {
      return true
    }
    return false
  }

  async _downloadPackage(downloadUrl: string): NodeRedFlowPackage {
    this.info('Downloading flow:', downloadUrl)
    const res = await fetch(downloadUrl)
    if (!res.ok) {
      throw new Error(`Failed response (${res.status} ${res.statusText})`)
    }
    return res.json()
  }

  async _updatePackage(flowPackage: NodeRedFlowPackage) {
    this.info('Updating package', flowPackage)
    const updates = []
    if (flowPackage.flow || flowPackage.flows) {
      const flows = flowPackage.flow || flowPackage.flows
      updates.push(
        new Promise((resolve, reject) => {
          const flowFilePath = path.join(this._getDataDir(), 'flows.json')
          fs.writeFile(flowFilePath, JSON.stringify(flows), err =>
            err ? reject(err) : resolve()
          )
        })
      )
    }
    if (flowPackage.cred || flowPackage.creds) {
      let creds = flowPackage.cred || flowPackage.creds
      updates.push(
        new Promise((resolve, reject) => {
          const credFilePath = path.join(this._getDataDir(), 'flows_cred.json')
          const editSessionRequested = this._flowPackageContainsEditSession(
            flowPackage
          )

          let settings
          if (editSessionRequested) {
            // enebular-editor remote deploy
            settings = require(path.join(
              this._getDataDir(),
              'enebular-editor-settings.js'
            ))
          } else {
            settings = require(path.join(this._getDataDir(), 'settings.js'))
          }
          if (settings.credentialSecret === false) {
            this.info('skip credential encryption')
          } else {
            this.info('credential encryption')
            try {
              const dotconfig = fs.readFileSync(
                path.join(this._getDataDir(), '.config.json'),
                'utf8'
              )

              // enebular-node-red dont see credentialSecret in settings.js
              // const defaultKey =
              //  settings.credentialSecret ||
              //  JSON.parse(dotconfig)._credentialSecret
              const defaultKey = JSON.parse(dotconfig)._credentialSecret

              creds = { $: encryptCredential(defaultKey, creds) }
            } catch (err) {
              throw new Error(
                'encrypt credential and create flows_cred.json failed',
                err
              )
            }
          }

          fs.writeFile(credFilePath, JSON.stringify(creds), err =>
            err ? reject(err) : resolve()
          )
        })
      )
    }
    if (flowPackage.handlers) {
      updates.push(
        new Promise(async (resolve, reject) => {
          const aiNodesDir = this._getAiNodesDir()
          const exist = fs.existsSync(aiNodesDir)
          if (exist) {
            rimraf.sync(aiNodesDir)
          }
          fs.mkdir(aiNodesDir, err => {
            if (err) {
              reject(err)
            }
            this._createAiNodes(flowPackage.handlers, aiNodesDir)
              .then(() => resolve())
              .catch(err => reject(err))
          })
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
          if (
            Object.keys(flowPackage.packages).includes(
              'node-red-contrib-enebular'
            )
          ) {
            flowPackage.packages['node-red-contrib-enebular'] =
              'file:../../node-red-contrib-enebular'
          }
          if (flowPackage.handlers) {
            Object.keys(flowPackage.handlers).forEach(handler => {
              flowPackage.packages[
                `enebular-ai-contrib-${handler}`
              ] = `file:../node-red-enebular-ai-nodes/${handler}`
            })
          }
          const packageJSON = JSON.stringify(
            {
              name: 'enebular-agent-dynamic-deps',
              version: '0.0.1',
              dependencies: flowPackage.packages
            },
            null,
            2
          )
          fs.writeFile(packageJSONFilePath, packageJSON, err =>
            err ? reject(err) : resolve()
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

  // async _installAiNodes(aiNodes, projectId) {
  //   const { nodes, ts } = aiNodes
  //   const aiNodesDir = path.resolve(this._getAiNodesDir(), projectId)
  //   const exist = fs.existsSync(path.resolve(aiNodesDir, '.config'))
  //   let keys
  //   if (!exist) {
  //     await mkdirpAsync(aiNodesDir)
  //     keys = await this._createAiNodes(nodes, aiNodesDir)
  //   } else {
  //     const oldConfig = await fsReadFileAsync(
  //       path.resolve(aiNodesDir, '.config'),
  //       'utf-8'
  //     )
  //     const jsonConfig = JSON.parse(oldConfig)
  //     if (Number(ts) === Number(jsonConfig.ts)) {
  //       keys = jsonConfig.keys
  //     } else {
  //       keys = await this._createAiNodes(nodes, aiNodesDir)
  //     }
  //   }
  //   const pkgJSON = await fsReadFileAsync(
  //     path.resolve(installDir, 'package.json'),
  //     'utf-8'
  //   )
  //   const pkg = JSON.parse(pkgJSON)
  //   const toInstall = {}
  //   keys.map(key => {
  //     toInstall[
  //       `enebular-ai-contrib-${key}`
  //     ] = `file:../../../node-red/node-red-enebular-ai-nodes/${projectId}/${key}`
  //     return symlinkAsync(
  //       path.resolve(this._getAiNodesDir(), projectId, key),
  //       path.resolve(installDir, 'node_modules', `enebular-ai-contrib-${key}`),
  //       'dir'
  //     )
  //   })
  //   pkg.dependencies = { ...pkg.dependencies, ...toInstall }
  //   await fsWriteFileAsync(
  //     path.resolve(installDir, 'package.json'),
  //     JSON.stringify(pkg, null, 2)
  //   )
  //   await fsWriteFileAsync(
  //     path.resolve(aiNodesDir, '.config'),
  //     JSON.stringify({ keys, ts })
  //   )
  // }

  async _createAiNodes(nodes, aiNodesDir) {
    const packageIds = Object.keys(nodes)
    await Promise.all(
      packageIds.map(async key => {
        const aiNodeDir = path.resolve(aiNodesDir, key)
        await mkdirAsync(aiNodeDir)
        await mkdirAsync(path.resolve(aiNodeDir, 'nodes'))
        return Promise.all(
          nodes[key].map(node =>
            createNodeDefinition(node, aiNodeDir).then(() => node.id)
          )
        )
      })
    )
    await Promise.all(
      packageIds.map(async pkgId => {
        const aiNodeDir = path.resolve(aiNodesDir, pkgId)
        await mkdirAsync(path.resolve(aiNodeDir, 'icons'))
        await fsCopyFileAsync(
          path.resolve(this._getDataDir(), 'img', 'enebular_logo.svg'),
          path.resolve(aiNodeDir, 'icons', 'icon.svg')
        )
        const pkgNodes = nodes[pkgId].reduce((accum, node) => {
          accum[node.id] = `./nodes/${node.id}.js`
          return accum
        }, {})
        const packageJSON = `{"name":"enebular-ai-contrib-${pkgId}","version":"0.0.1","description":"A sample node for node-red","dependencies":{"request":"^2.88.0"},"keywords":["node-red"],"node-red":{"nodes":${JSON.stringify(
          pkgNodes
        )}}}`
        await fsWriteFileAsync(
          path.resolve(aiNodeDir, 'package.json'),
          packageJSON
        )
      })
    )
    return packageIds
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

  async startService(editSession: EditSession) {
    return this._queueAction(() => this._startService(editSession))
  }

  async _startService(editSession: EditSession) {
    if (editSession) {
      this.info('Starting service (editor mode)...')
    } else {
      this.info('Starting service...')
    }

    let executedLoadURL = false
    return new Promise((resolve, reject) => {
      if (fs.existsSync(this._pidFile)) {
        ProcessUtil.killProcessByPIDFile(this._pidFile)
      }
      let [command, ...args] = this._command.split(/\s+/)
      let env = Object.assign(process.env, {
        ENEBULAR_ASSETS_DATA_PATH: this._assetsDataPath
      })
      if (editSession) {
        args = ['-s', '.node-red-config/enebular-editor-settings.js']
        env['ENEBULAR_EDITOR_URL'] = `http://${editSession.ipAddress}:9017`
        env['ENEBULAR_EDITOR_SESSION_TOKEN'] = editSession.sessionToken
      }
      const cproc = spawn(command, args, {
        stdio: 'pipe',
        cwd: this._dir,
        env: env
      })
      cproc.stdout.on('data', data => {
        let str = data.toString().replace(/(\n|\r)+$/, '')
        this._nodeRedLog.info(str)
        if (editSession && !executedLoadURL && str.includes('Started flows')) {
          this._nodeRedLog.info('Pinging enebular editor...')
          this._sendEditorAgentIPAddress(editSession)
          executedLoadURL = true
        }
      })
      cproc.stderr.on('data', data => {
        let str = data.toString().replace(/(\n|\r)+$/, '')
        this._nodeRedLog.error(str)
      })
      cproc.once('exit', (code, signal) => {
        this.info(`Service exited (${code !== null ? code : signal})`)
        this._cproc = null
        /* Restart automatically on an abnormal exit. */
        if (code !== 0) {
          let shouldRetry = ProcessUtil.shouldRetryOnCrash(this._retryInfo)
          if (shouldRetry) {
            this.info(
              'Unexpected exit, restarting service in 1 second. Retry count:' +
                this._retryInfo.retryCount
            )
            setTimeout(() => {
              this._startService(editSession)
            }, 1000)
          } else {
            this.info(
              `Unexpected exit, but retry count(${
                this._retryInfo.retryCount
              }) exceed max.`
            )
            /* Other restart strategies (change port, etc.) could be tried here. */
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

  async shutdownService() {
    return this._queueAction(() => this._shutdownService())
  }

  async _shutdownService() {
    return new Promise((resolve, reject) => {
      const cproc = this._cproc
      if (cproc) {
        this.info('Shutting down service...')
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

  async _sendEditorAgentIPAddress(editSession: EditSession) {
    const { ipAddress, sessionToken } = editSession
    try {
      const res = await fetch(
        `http://${ipAddress}:9017/api/v1/agent-editor/ping`,
        {
          method: 'POST',
          headers: {
            'x-ee-session': sessionToken
          }
        }
      )
      if (!res.ok) {
        throw new Error(`Failed response (${res.status} ${res.statusText})`)
      }
    } catch (err) {
      this.error('Failed to ping editor: ' + err.message)
    }
  }

  async restartService() {
    return this._queueAction(() => this._restartService())
  }

  async _restartInEditorMode(editSession: EditSession) {
    this.info('Restarting service (editor mode)...')
    this.info(`enebular editor IP Address: ${editSession.ipAddress}`)
    await this._shutdownService()
    await this._startService(editSession)
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
