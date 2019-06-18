/* @flow */

import fs from 'fs'
import objectHash from 'object-hash'
import path from 'path'
import Docker from 'dockerode'
import type { Logger } from 'winston'
import { delay } from './utils'
import Container from './container'
import AiModel from './ai-model'
import type AgentInfoManager from './agent-info-manager'
import type AgentManagerMediator from './agent-manager-mediator'
import type DeviceStateManager from './device-state-manager'
import type PortManager from './port-manager'
import type Config from './config'

const moduleName = 'docker-man'

export default class DockerManager {
  _test: boolean = false
  _deviceStateMan: DeviceStateManager
  _agentInfoMan: AgentInfoManager
  _log: Logger
  _docker: Docker
  _aiModelDir: string
  _models: Array<AiModel> = []
  _inited: boolean = false
  _active: boolean = false
  _stateDockerPath: string
  _updateAttemptsMax: number = 1
  agentMan: AgentManagerMediator
  portMan: PortManager

  constructor(
    deviceStateMan: DeviceStateManager,
    agentMan: AgentManagerMediator,
    agentInfoMan: AgentInfoManager,
    portMan: PortManager,
    config: Config,
    log: Logger
  ) {
    this._stateDockerPath = config.get('ENEBULAR_DOCKER_STATE_PATH')
    this._aiModelDir = path.resolve(config.get('ENEBULAR_AI_MODELS_DATA_PATH'))

    if (!this._stateDockerPath || !this._aiModelDir) {
      throw new Error('Missing docker-man configuration')
    }

    this._deviceStateMan = deviceStateMan
    this._agentInfoMan = agentInfoMan
    this.agentMan = agentMan
    this.portMan = portMan
    this._log = log

    if (config.get('ENEBULAR_DOCKER_MODE')) {
      this._test = true
    }
    this._deviceStateMan.on('stateChange', params =>
      this._handleDeviceStateChange(params)
    )
  }

  aiModelDir(): string {
    return this._aiModelDir
  }

  mountDir(): string {
    return path.join(this._aiModelDir, '.mount')
  }

  docker(): Docker {
    return this._docker
  }

  ipAddress() {
    return this._agentInfoMan.ip()
  }

  isTestMode() {
    return this._test
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

  async setup() {
    if (this._inited) {
      return
    }

    try {
      this._docker = new Docker()
    } catch (err) {
      this.debug(err)
      return this.info('Docker not installed')
    }

    this.debug('Docker state path: ' + this._stateDockerPath)

    await this._init()

    this._inited = true
  }

  async _init() {
    await this._loadDocker()
    await this._updateDockerFromDesiredState()
    await this._startContainers()
    await this._updateDockerReportedState()
  }

  /**
   * STATE MANAGEMENT
   */
  async _loadDocker() {
    if (!fs.existsSync(this._stateDockerPath)) {
      return
    }

    this.info('Loading docker state: ' + this._stateDockerPath)

    const data = fs.readFileSync(this._stateDockerPath, 'utf8')
    const serializedModels = JSON.parse(data)
    for (const serializedModel of serializedModels) {
      const container = this._deserializeModel(serializedModel)
      this._models.push(container)
    }
  }

  _deserializeModel(serializedModel: Object): Container {
    let model
    switch (serializedModel.type) {
      case 'ai':
        model = new AiModel(serializedModel.type, serializedModel.id, this)
        break
      default:
        throw new Error('Unsupported model type: ' + serializedModel.type)
    }
    model.updateId = serializedModel.updateId
    model.config = serializedModel.config
    model.dockerConfig = serializedModel.dockerConfig
    model.state = serializedModel.state
    model.enable = serializedModel.enable
    model.status = serializedModel.status
    model.statusMessage = serializedModel.statusMessage
    model.endpoint = serializedModel.endpoint
    model.changeTs = serializedModel.changeTs
    model.changeErrMsg = serializedModel.changeErrMsg
    model.pendingChange = serializedModel.pendingChange
    model.pendingUpdateId = serializedModel.pendingUpdateId
    model.pendingConfig = serializedModel.pendingConfig
    model.updateAttemptCount = serializedModel.updateAttemptCount
    model.lastAttemptedUpdateId = serializedModel.lastAttemptedUpdateId

    return model
  }

  _saveDockerState() {
    this.debug('Saving docker state...')

    let serializedModels = []
    for (let model of this._models) {
      switch (model.state) {
        case 'notDeployed':
        case 'deployed':
        case 'deployFail':
        case 'removeFail':
          serializedModels.push(model.serialize())
          break
        default:
          break
      }
    }
    this.debug('Model state: ' + JSON.stringify(serializedModels, null, 2))
    try {
      fs.writeFileSync(
        this._stateDockerPath,
        JSON.stringify(serializedModels),
        'utf8'
      )
    } catch (err) {
      this.error('Failed to save model state: ' + err.message)
    }
  }

  async _handleDeviceStateChange(params: { type: string, path: ?string }) {
    if (!this._inited) {
      return
    }

    if (params.path && !params.path.startsWith('docker')) {
      return
    }

    switch (params.type) {
      case 'desired':
        this._updateDockerFromDesiredState()
        break
      case 'reported':
        this._updateDockerReportedState()
        break
      default:
        break
    }
  }

  async _updateDockerFromDesiredState() {
    const desiredState = this._deviceStateMan.getState('desired', 'docker')
    if (!desiredState) {
      return
    }

    this.info('Docker state change: ' + JSON.stringify(desiredState, null, 2))

    // handle changes for models
    const desiredModels = desiredState.models || {}

    // Determine models requiring a 'deploy' change
    let newModels = []
    for (const desiredModelId in desiredModels) {
      if (!desiredModels.hasOwnProperty(desiredModelId)) {
        continue
      }
      let desiredModel = desiredModels[desiredModelId]

      // Updates to existing models
      let found = false
      for (let model of this._models) {
        if (model.id() === desiredModelId) {
          if (
            (!model.pendingChange &&
              model.updateId !== desiredModel.updateId) ||
            (model.pendingChange === 'deploy' &&
              model.pendingUpdateId !== desiredModel.updateId) ||
            model.pendingChange === 'remove'
          ) {
            model.setPendingChange(
              'deploy',
              desiredModel.updateId,
              desiredModel.config
            )
          }
          found = true

          if (desiredModel.hasOwnProperty('enable')) {
            this.info('DESIRED HAS ENABLE')
            this.info('MODEL ENABLE', model.enable)
            this.info('desiredModel ENABLE', desiredModel.enable)
            if (model.enable !== desiredModel.enable) {
              this.info('ENABLE REQUEST')
              model.enable = desiredModel.enable
              model.enableRequest()
            }
          } else {
            this.info('DESIRED NO ENABLE')
            // enable is undefined or false
            if (!model.enable) {
              this.info('DEFAULT ENABLE')
              // the default enable state is true
              model.enable = true
              model.enableRequest()
            }
          }
          break
        }
      }

      // New models
      if (!found) {
        let model = null
        switch (desiredModel.config.type) {
          case 'ai':
            model = new AiModel(desiredModel.config.type, desiredModelId, this)
            model.state = 'notDeployed'
            model.setPendingChange(
              'deploy',
              desiredModel.updateId,
              desiredModel.config
            )
            break
          default:
            this.error('Unsupported model type: ' + desiredModel.config.type)
            break
        }
        if (model) {
          newModels.push(model)
        }
      }
    }

    // Determine models requiring a 'remove change
    for (let model of this._models) {
      if (!desiredModels.hasOwnProperty(model.id())) {
        model.setPendingChange('remove', null, null)
      }
    }

    // Append 'new' models
    this._models = this._models.concat(newModels)

    this._updateDockerReportedState()
    this._processPendingChanges()
  }

  _updateDockerReportedState() {
    const reportedState = this._deviceStateMan.getState('reported', 'docker')
    if (!reportedState) {
      return
    }

    this.debug(
      'Docker reported state: ' + JSON.stringify(reportedState, null, 2)
    )

    if (reportedState.models) {
      // Remove reported models that no longer exist
      for (const reportedModelId in reportedState.models) {
        if (!reportedState.models.hasOwnProperty(reportedModelId)) {
          continue
        }
        let found = false
        for (let model of this._models) {
          if (model.id() === reportedModelId) {
            found = true
            break
          }
        }
        if (!found) {
          this._removeModelReportedState(reportedModelId)
        }
      }
    }

    // Update all current models (if required)
    for (let model of this._models) {
      this._updateModelReportedState(model)
    }
  }

  _removeModelReportedState(modelId: string) {
    if (!this._deviceStateMan.canUpdateState('reported')) {
      return
    }

    this.debug(`Removing model '${modelId}' reported state`)
    this._deviceStateMan.updateState(
      'reported',
      'remove',
      'docker.models.' + modelId
    )
  }

  _getReportedModelState(modelId: string): ?Object {
    const reportedState = this._deviceStateMan.getState('reported', 'docker')
    if (!reportedState || !reportedState.models) {
      return null
    }

    return reportedState.models[modelId]
  }

  async sync(type, item) {
    switch (type) {
      case 'status':
        this._updateModelReportedState(item)
        break
      default:
        return
    }

    await this._saveDockerState()
  }

  // Only updates the reported state if required (if there is a difference)
  _updateModelReportedState(model: AiModel) {
    if (!this._deviceStateMan.canUpdateState('reported')) {
      return
    }

    // Create new reported state
    let state
    if (model.pendingChange) {
      switch (model.pendingChange) {
        case 'deploy':
          state = 'deployPending'
          break
        case 'remove':
          state = 'removePending'
          break
        default:
          state = 'unknown'
          break
      }
    } else {
      state = model.state
    }
    let newStateObj = {
      ts: model.changeTs,
      state: state
    }
    if (model.changeErrMsg) {
      newStateObj.message = model.changeErrMsg
    }
    if (model.pendingChange) {
      newStateObj.pendingUpdateId = model.pendingUpdateId
    }
    if (state === 'deploying') {
      newStateObj.updateAttemptCount = model.updateAttemptCount
    }
    if (model.config) {
      newStateObj.config = model.config
    } else if (model.state === 'notDeployed' && model.pendingConfig) {
      newStateObj.config = model.pendingConfig
    }
    if (model.dockerConfig) {
      newStateObj.dockerConfig = model.dockerConfig
    }
    if (model.status) {
      newStateObj.status = model.status
    }
    if (model.statusMessage) {
      newStateObj.statusMessage = model.statusMessage
    }
    if (model.endpoint) {
      newStateObj.endpoint = model.endpoint
    }
    if (model.hasOwnProperty('enable')) {
      newStateObj.enable = model.enable
    }
    newStateObj.updateId =
      model.state === 'notDeployed' ? model.pendingUpdateId : model.updateId

    // Compare with currently reported state
    const currentStateObj = this._getReportedModelState(model.id())
    if (
      currentStateObj &&
      objectHash(currentStateObj) === objectHash(newStateObj)
    ) {
      this.debug(`Update of model '${model.id()}' reported state not required`)
      return
    }

    // Update if required
    this.debug(`Updating model '${model.id()}' reported state...`)
    // this.debug('Current state: ' + util.inspect(currentStateObj))
    // this.debug('New state: ' + util.inspect(newStateObj))
    this._deviceStateMan.updateState(
      'reported',
      'set',
      'docker.models.' + model.id(),
      newStateObj
    )
  }

  _getFirstPendingChangeModel(): ?Container {
    if (this._models.length < 1) {
      return null
    }
    for (let model of this._models) {
      if (model.pendingChange || model.pendingEnableRequest) {
        return model
      }
    }
    return null
  }

  _setModelState(model: Model, state: string) {
    model.setState(state)
    this._updateModelReportedState(model)
  }

  async _processPendingChanges() {
    if (this._processingChanges) {
      return
    }
    this._processingChanges = true

    while (this._active) {
      let model = this._getFirstPendingChangeModel()
      if (!model) {
        break
      }

      // Dequeue the pending change
      let pendingChange = model.pendingChange
      let pendingUpdateId = model.pendingUpdateId
      let pendingConfig = model.pendingConfig
      let pendingEnableRequest = model.pendingEnableRequest

      model.pendingChange = null
      model.pendingUpdateId = null
      model.pendingConfig = null
      model.pendingEnableRequest = null

      // Reset update attempt count if this is a different update
      if (pendingUpdateId !== model.lastAttemptedUpdateId) {
        model.lastAttemptedUpdateId = pendingUpdateId
        model.updateAttemptCount = 0
      }
      if (pendingChange != null) {
        // Process the change
        switch (pendingChange) {
          case 'deploy':
            // Save current state so we can revert back to it if required
            const prevState = model.state
            const prevConfig = model.config
            const prevUpdateId = model.updateId

            // Remove if already deployed (or deployFail)
            if (model.state === 'deployed' || model.state === 'deployFail') {
              this._setModelState(model, 'removing')
              let success = await model.remove()
              if (!success) {
                this.info('Remove failed, but continuing with deploy...')
                this._setModelState(model, 'removeFail')
              }
            }

            // Apply the update and attempt deploy
            model.updateId = pendingUpdateId
            model.config = pendingConfig
            model.updateAttemptCount++
            this._setModelState(model, 'deploying')
            let success = await model.deploy()
            if (!success) {
              if (model.updateAttemptCount < this._updateAttemptsMax) {
                if (model.pendingChange === null) {
                  this.info(
                    `Deploy failed, but will retry (${
                      model.updateAttemptCount
                    }/${this._updateAttemptsMax}).`
                  )
                  model.setPendingChange(
                    pendingChange,
                    pendingUpdateId,
                    pendingConfig
                  )
                } else {
                  this.info('Deploy failed, but new change already pending.')
                }
                model.updateId = prevUpdateId
                model.config = prevConfig
                // Note that setting it back to prevConfig may be a lie as it may
                // have been 'removed', but it's ok for now to keep things simple.
                this._setModelState(model, prevState)
              } else {
                this.info(
                  `Deploy failed maximum number of times (${
                    model.updateAttemptCount
                  })`
                )
                this._setModelState(model, 'deployFail')
              }
            } else {
              this._setModelState(model, 'deployed')
            }
            break

          case 'remove':
            if (model.state === 'deployed' || model.state === 'deployFail') {
              this._setModelState(model, 'removing')
              let success = await model.remove()
              if (!success) {
                this._setModelState(model, 'removeFail')
                break
              }
            }
            this._removeModelReportedState(model.id())
            // The asset may have received a new pendingChange again while we were
            // await'ing, so check for that before we really remove it.
            if (!model.pendingChange) {
              this.model = this._models.filter(a => {
                return a !== model
              })
            }
            break

          default:
            this.error('Unsupported pending change: ' + pendingChange)
            break
        }
      }

      if (pendingEnableRequest) {
        this.info('Processing model enable change')
        if (model.isEnabled()) {
          await model.attemptEnable()
        } else {
          await model.attemptDisable()
        }
      }

      // Save the changed state
      this._saveDockerState()

      // A small delay to guard against becoming a heavy duty busy loop
      await delay(1 * 1000)
    }

    this._processingChanges = false
  }

  activate(active: boolean) {
    if (active === this._active) {
      return
    }
    if (active && !this._inited) {
      this.error('Attempted to activate docker-man when not initialized')
      return
    }
    this._active = active
    if (this._active) {
      this._processPendingChanges()
    } else {
      this.shutDown()
    }
  }

  /**
   * DOCKER MANAGEMENT
   */

  addContainer(container) {
    this._models.push(container)
  }

  async _startContainers() {
    this.info('Starting models...')
    await Promise.all(
      this._models.map(async (model, idx) => {
        const success = await this._wakeContainer(model)
        if (!success) {
          this.error(`Could not start a model ${model.name()}...`)
        }
      })
    )
  }

  removeContainer(key) {
    this._models = this._models.filter(container => container.id() !== key)
    this._removeModelReportedState(key)
  }

  getContainer(key) {
    return this._docker.getContainer(key)
  }

  container(key) {
    return this._models.find(container => container.id() === key)
  }

  async _wakeContainer(model) {
    let success
    // Find and start container
    try {
      this.info('MODEL ENABLEEEEEEEEEEE,', model.enable)
      this.debug('Waking up container : ', model.containerId())
      const existingContainer = this.getContainer(model.containerId())
      model.attachContainer(existingContainer)
      if (!model.isEnabled()) {
        this.info('CONTAINER IS NOT ENABLEEDDDDDD')
        return true
      }
      success = await model.container.start()
    } catch (err) {
      success = false
    }
    if (!success) {
      // Recreate container based on existing data
      try {
        await model.container.repair()
        success = await model.container.start()
      } catch (err) {
        success = false
      }
    }
    return success
  }

  async shutDown() {
    this.info('Shuting down all running models')
    try {
      await Promise.all(this._models.map(model => model.container.shutDown()))
    } catch (err) {
      this.error('Shuting down models error', err.message)
    }
  }

  async pullImage(repoTag, options) {
    return new Promise((resolve, reject) => {
      this.info('Pulling image: ', repoTag)
      this._docker.pull(repoTag, (err, stream) => {
        if (err) {
          this.error(err)
          reject(err)
        }
        const onFinished = (err, output) => {
          if (err) {
            this._log.info(err)
            reject(err)
          }

          this.info('Finished pulling image: ', repoTag)
          resolve(output)
        }
        let count = 0
        const onProgress = ({ status, progress }) => {
          if (count % 15 === 0) {
            this.info(status)
            if (progress) {
              this.info(progress)
            }
            count = 1
          } else {
            count++
          }
        }
        this._docker.modem.followProgress(stream, onFinished, onProgress)
      })
    })
  }

  async createContainer(config) {
    return this._docker.createContainer(config)
  }

  _checkExistingContainer(modelId) {
    this.info('Checking if model is already running...')
    try {
      const container = this.container(modelId)
      return container
    } catch (err) {
      this.error('Checking models error', err.message)
    }
  }

  async prepare(config) {
    const { modelId } = config

    const existingContainer = this._checkExistingContainer(modelId)
    if (existingContainer) {
      this.info('Same container found... Removing')
      await existingContainer.remove(true)
      this.removeContainer(modelId)
      return { exist: true, port: existingContainer.port() }
    }
    return { exist: false }
  }

  async createNewContainer(createOptions) {
    this.info('Creating container')
    const { mounts, ports, imageName, cmd, cores, maxRam } = createOptions
    // pulling docker image
    await this.pullImage(imageName)
    const config = {
      HostConfig: {
        Binds: mounts,
        Memory: maxRam,
        CpuShares: cores,
        Privileged: true
      },
      Image: imageName,
      Cmd: cmd,
      Tty: true
    }
    if (ports) {
      config.HostConfig.PortBindings = {}
      config.ExposedPorts = {}
      ports.forEach(port => {
        config.HostConfig.PortBindings[`${port}/tcp`] = [
          { HostPort: `${port}` }
        ]
        config.ExposedPorts[`${port}/tcp`] = {}
      })
    }
    const container = await this._docker.createContainer(config)

    return container
  }
}
