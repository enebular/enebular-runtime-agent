/* @flow */

import fs from 'fs'
// import ip from 'ip'
import objectHash from 'object-hash'
import path from 'path'
import Docker from 'dockerode'
import portfinder from 'portfinder'
import type { Logger } from 'winston'
import { delay } from './utils'
import AiModelAsset from './ai-model-asset'
import type AgentManagerMediator from './agent-manager-mediator'
import type DeviceStateManager from './device-state-manager'
import type Config from './config'
import type { ContainerConfig } from './container'

const moduleName = 'ai-model-man'
/**
 * AI Asset 'State & Status' Management and Representation
 *
 * Consist of 2 main parts:
 *  - Deploying of AI Model (state)
 *  - Managing Docker Container associated with deployed AI Model (status)
 *
 * * State Management (Deployment)
 *
 * Mechanism of deployment is the same as with File Asset, but there is a key difference:
 *
 * After Asset is deployed, it will proceed to extract itself to a `mount` folder,
 * which will be mounted into an actual Docker Container.
 *
 * After extracting free port to use is found and ai wrapper is downloaded to extracted folder.
 *
 * After it Docker Container is created and extracted folder is mounted in it.
 *
 * Deployment procedure will end only after Docker Container is successfully created.
 *
 * The state of a single asset is chiefly managed through two properties:
 *
 *   - Its current acutal state (asset.state)
 *   - Its current pending change (asset.pendingChange)
 *
 * On top of that, those two properties are then combined into a single overall
 * current 'state' for use in the 'reported' device state.
 *
 * An asset's configuration details are maintained in the following two
 * properties:
 *
 *   - Its current config (asset.config)
 *   - Its pending config (asset.pendingConfig)
 *
 * The asset 'current actual' states are:
 *
 *   - notDeployed - Asset is not deployed (is new / never been deployed before)
 *   - deployed -  Asset is fully / successfully deployed
 *   - deploying -  Asset is being deployed
 *   - deployFail -  Asset deploy failed
 *   - removing -  Asset is being removed
 *   - removeFail - Asset remove failed
 *
 * Note that the initial state of a newly added (deployed for the first time)
 * asset will be 'notDeployed'. However, on removal, after the asset has been
 * successfully removed it is just cleared from the state completely, and so
 * doesn't go back to the 'notDeployed' state.
 *
 * The asset 'pending change' types are:
 *
 *   - deploy - Asset will be (re)deployed
 *   - remove - Asset will be removed
 *
 * The overall 'combined' asset states (as used in 'reported') are:
 *
 *   - deployPending - Asset will be (re)deployed
 *     - config: Current config if asset.state is not 'notDeployed'
 *     - pendingConfig: Config to be deployed
 *     - config in 'reported': if asset.state is 'notDeployed' it is
 *       pendingConfig, otherwise it is config.
 *
 *   - deploying - Asset is being deployed
 *     - config: Config being deployed
 *     - pendingConfig: null
 *     - config in 'reported': config
 *
 *   - deployed - Asset is fully / successfully deployed
 *     - config: Config deployed
 *     - pendingConfig: null
 *     - config in 'reported': config
 *
 *   - deployFail - Asset deploy failed
 *     - config: Config for the deploy that failed
 *     - pendingConfig: null
 *     - config in 'reported': config
 *
 *   - removePending - Asset will be removed
 *     - config: Config deployed
 *     - pendingConfig: null
 *     - config in 'reported': config
 *
 *   - removing - Asset is being removed
 *     - config: Config deployed
 *     - pendingConfig: null
 *     - config in 'reported': config
 *
 *   - removeFail - Asset remove failed
 *     - config: Config deployed (before remove failure)
 *     - pendingConfig: null
 *     - config in 'reported': config
 *
 * * Status Management (Docker Container)
 *
 * Each successfully deployed Asset has Docker Container attached to it.
 *
 * Docker Container represented by `container` property of asset.
 * This `Container` stores all information about current status of Container.
 * and information needed to recreate it if necessary.
 *
 *  The status of a single asset is chiefly managed through these properties:
 *
 *   - Current acutal status of asset (asset.status)
 *   - Current acutal status of container (container.status)
 *   - If this container is allowed to start (asset.enable)
 *   - Pending starting/stopping of container (asset.pendingEnableRequest)
 *
 * On top of that, those properties are then combined into a single overall
 * current 'status' for use in the 'reported' device state.
 *
 * An asset's Docker Container configuration details are maintained in the following
 * property:
 *
 *   - Its current Docker container config (asset.container.config)
 *
 * The asset 'current actual' statuses are:
 *
 *   - running - Asset is running
 *   - stopped -  Asset is stopped and is not allowed to run
 *   - error -  There was an error in a runtime of Asset
 *
 * The container 'current actual' statuses are:
 *
 *   - starting - Container is trying to start
 *   - running - Container is running
 *   - stopping - Container is trying to stop
 *   - stopped -  Container is stopped and is not allowed to run
 *   - removing - Container is trying to remove itself
 *   - down - Container is shutdown (while stopping runtime agent)
 *   - error -  There was an error in a runtime of Container
 *
 * Based on Asset's `enable` property actual Docker Container is allowed to run on runtime agent startup.
 *
 */

export default class AiModelManager {
  _deviceStateMan: DeviceStateManager
  _log: Logger
  _docker: Docker
  _aiModelDir: string
  _models: Array<AiModelAsset> = []
  _inited: boolean = false
  _active: boolean = false
  _stateAiModelsPath: string
  _updateAttemptsMax: number = 1
  agentMan: AgentManagerMediator

  constructor(
    deviceStateMan: DeviceStateManager,
    agentMan: AgentManagerMediator,
    config: Config,
    log: Logger
  ) {
    this._stateAiModelsPath = config.get('ENEBULAR_AI_MODELS_STATE_PATH')
    this._aiModelDir = path.resolve(config.get('ENEBULAR_AI_MODELS_DATA_PATH'))

    if (!this._stateAiModelsPath || !this._aiModelDir) {
      throw new Error('Missing ai-model-man configuration')
    }

    this._deviceStateMan = deviceStateMan
    this.agentMan = agentMan
    this._log = log

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

  ipAddress() {
    // return ip.address()
    return 'localhost'
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
      this.error('Could not find Docker API', err.message)
      return
    }

    this.debug('Ai Models path: ' + this._stateAiModelsPath)

    await this._init()

    this._inited = true
  }

  async _init() {
    await this._loadModels()
    await this._updateModelsFromDesiredState()
    await this._startModels()
    await this._updateModelsReportedState()
  }

  /**
   * STATE MANAGEMENT
   */
  async _loadModels() {
    if (!fs.existsSync(this._stateAiModelsPath)) {
      return
    }

    this.info('Loading ai models state: ' + this._stateAiModelsPath)

    const data = fs.readFileSync(this._stateAiModelsPath, 'utf8')
    const serializedModels = JSON.parse(data)
    for (const serializedModel of serializedModels) {
      const model = this._deserializeModel(serializedModel)
      this._models.push(model)
    }
  }

  _deserializeModel(serializedModel: Object): AiModelAsset {
    switch (serializedModel.type) {
      case 'ai':
        break
      default:
        throw new Error('Unsupported model type: ' + serializedModel.type)
    }

    let model = new AiModelAsset(serializedModel.type, serializedModel.id, this)

    model.updateId = serializedModel.updateId
    model.config = serializedModel.config
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
    if (serializedModel.containerConfig) {
      model.createContainerFromConfig(serializedModel.containerConfig)
    }

    return model
  }

  _saveModelsState() {
    this.debug('Saving ai models state...')

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
        this._stateAiModelsPath,
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

    if (params.path && !params.path.startsWith('aiModels')) {
      return
    }

    switch (params.type) {
      case 'desired':
        this._updateModelsFromDesiredState()
        break
      case 'reported':
        this._updateModelsReportedState()
        break
      default:
        break
    }
  }

  async _updateModelsFromDesiredState() {
    const desiredState = this._deviceStateMan.getState('desired', 'aiModels')
    if (!desiredState) {
      return
    }

    this.debug('Ai Models change: ' + JSON.stringify(desiredState, null, 2))

    // handle changes for models
    const desiredModels = desiredState.aiModels || {}

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
            if (model.enable !== desiredModel.enable) {
              model.enable = desiredModel.enable
              model.enableRequest()
            }
          } else {
            // enable is undefined or false
            if (!model.enable) {
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
            model = new AiModelAsset(
              desiredModel.config.type,
              desiredModelId,
              this
            )
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

    this._updateModelsReportedState()
    this._processPendingChanges()
  }

  _updateModelsReportedState() {
    const reportedState = this._deviceStateMan.getState('reported', 'aiModels')
    if (!reportedState) {
      return
    }

    this.debug(
      'Docker reported state: ' + JSON.stringify(reportedState, null, 2)
    )

    if (reportedState.aiModels) {
      // Remove reported models that no longer exist
      for (const reportedModelId in reportedState.aiModels) {
        if (!reportedState.aiModels.hasOwnProperty(reportedModelId)) {
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
      'aiModels.aiModels.' + modelId
    )
  }

  _getReportedModelState(modelId: string): ?Object {
    const reportedState = this._deviceStateMan.getState('reported', 'aiModels')
    if (!reportedState || !reportedState.aiModels) {
      return null
    }

    return reportedState.aiModels[modelId]
  }

  async sync(type: string, item: AiModelAsset) {
    switch (type) {
      case 'status':
        this._updateModelReportedState(item)
        break
      default:
        return
    }

    await this._saveModelsState()
  }

  // Only updates the reported state if required (if there is a difference)
  _updateModelReportedState(model: AiModelAsset) {
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
      'aiModels.aiModels.' + model.id(),
      newStateObj
    )
  }

  _getFirstPendingChangeModel(): ?AiModelAsset {
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

  _setModelState(model: AiModelAsset, state: string) {
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
                    `Deploy failed, but will retry (${model.updateAttemptCount}/${this._updateAttemptsMax}).`
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
                  `Deploy failed maximum number of times (${model.updateAttemptCount})`
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
              this._models = this._models.filter(m => m !== model)
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
      this._saveModelsState()

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
      this.error('Attempted to activate ai-model-man when not initialized')
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

  async findFreePort() {
    let usedPorts = [49151]
    this._models.forEach(model => {
      if (model.getContainerPort()) {
        usedPorts.push(model.getContainerPort())
      }
    })
    let filteredPorts
    if (usedPorts.length > 1) {
      usedPorts = usedPorts.sort((e1, e2) => (e1 > e2 ? 1 : -1))
      filteredPorts = usedPorts.filter((e, i) => e + 1 !== usedPorts[i + 1])
    } else {
      filteredPorts = usedPorts
    }
    let port
    for (let i = 0; i < filteredPorts.length; i++) {
      port = await portfinder.getPortPromise({
        port: filteredPorts[i] + 1
      })
      if (!usedPorts.includes(port)) {
        break
      }
    }
    return port
  }

  async _startModels() {
    this.info('Starting models...')
    await Promise.all(
      this._models.map(async model => {
        const success = await this._wakeModel(model)
        if (!success) {
          this.error(`Could not start a model ${model.name()}...`)
        }
      })
    )
  }

  getDockerContainer(key: string): Docker.Container {
    return this._docker.getContainer(key)
  }

  async _wakeModel(model: AiModelAsset) {
    if (model.state !== 'deployed') {
      return true
    }
    let success
    // Find and start container
    try {
      const containerId = model.dockerContainerId()
      if (containerId) {
        this.debug('Waking up container : ', containerId)
        const existingDockerContainer = this.getDockerContainer(containerId)
        model.container.init(existingDockerContainer)
        if (!model.isEnabled()) {
          return true
        }
        success = await model.container.start()
      } else {
        success = false
      }
    } catch (err) {
      this.error(
        'Could not find an existing docker container info',
        err.message
      )
      success = false
    }
    if (!success) {
      // Recreate container based on existing data
      try {
        await model.container.repair()
        success = await model.container.start()
      } catch (err) {
        this.error('Could not repair an existing container', err.message)
        success = false
      }
    }
    return success
  }

  async shutDown() {
    this.info('Shuting down all running models')
    try {
      await Promise.all(this._models.map(model => model.shutDown()))
    } catch (err) {
      this.error('Shuting down models error', err.message)
    }
  }

  async pullImage(repoTag: string) {
    try {
      const output = await new Promise((resolve, reject) => {
        this.info('Pulling image: ', repoTag)
        this._docker.pull(repoTag, (err, stream) => {
          if (err || !stream) {
            this.error(err)
            return reject(err)
          }
          const onFinished = (err, output) => {
            if (err) {
              this.error(err)
              return reject(err)
            }

            this.info('Finished pulling image: ', repoTag)
            return resolve(output)
          }
          let count = 0
          const onProgress = ({ status, progress }) => {
            if (count % 15 === 0) {
              this.info(status)
              if (progress) {
                this.info(progress)
              }
            }
            count++
          }
          this._docker.modem.followProgress(stream, onFinished, onProgress)
        })
      })
      return output
    } catch (err) {
      this.error(err)
      throw new Error(`Could not pull docker image: ${err.message}`)
    }
  }

  async removeContainer(containerId: string): Promise<boolean> {
    try {
      const container = this.getDockerContainer(containerId)
      await container.remove({ force: true })
      return true
    } catch (err) {
      if (err.statusCode === 404) {
        this.error(`Container ${containerId} does not exist`, err.message)
      } else {
        this.error(`Error while removing container ${containerId}`, err.message)
      }
    }
    return false
  }

  async createContainer(createOptions: ContainerConfig): Docker.Container {
    this.info('Creating container')
    const { mounts, ports, imageName, cmd, cores, maxRam } = createOptions
    const cpuPeriod = 100000
    const quota = cores * cpuPeriod
    // pulling docker image
    await this.pullImage(imageName)
    const config = {
      HostConfig: {
        Binds: mounts,
        Memory: maxRam,
        CpuPeriod: cpuPeriod,
        CpuQuota: quota,
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
    this.debug(`Docker Container config`, config)
    const container = await this._docker.createContainer(config)

    return container
  }
}
