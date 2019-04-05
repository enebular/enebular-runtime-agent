import fs from 'fs'
import objectHash from 'object-hash'
import path from 'path'
import Docker from 'dockerode'
import stream from 'stream'
import type { Logger } from 'winston'
import { delay } from './utils'
import Container from './container'
import Exec from './exec'
import type AgentInfoManager from './agent-info-manager'

const moduleName = 'docker-man'

export default class DockerManager {
  _deviceStateMan: DeviceStateManager
  _agentInfoMan: AgentInfoManager
  _log: Logger
  _docker: Docker
  _aiModelDir: string
  _containers: Array<Container> = []
  _execs: Array<Exec> = []
  _inited: boolean = false
  _active: boolean = false
  _updateAttemptsMax: number = 3

  constructor(
    deviceStateMan: DeviceStateManager,
    agentInfoMan: AgentInfoManager,
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
    this._log = log
    // var socket = process.env.DOCKER_SOCKET || '/var/run/docker.sock'
    // var stats = fs.statSync(socket)
    // var stats2 = fs.statSync(dockerHost)

    // // this._log.info('STATS:' + stats)
    // this._log.info('STATS2:' + stats2)
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
    const dockerState = JSON.parse(data)
    const serializedContainers = dockerState.containers
    for (const serializedContainer of serializedContainers) {
      const container = this._deserializeContainer(serializedContainer)
      this._containers.push(container)
    }
    const serializedExecs = dockerState.execs
    // this.info('serializedContainers', serializedContainers)
    for (const serializedExec of serializedExecs) {
      const exec = this._deserializeExec(serializedExec)
      this._execs.push(exec)
    }
    // this.info('_containers, ', this._containers)
  }

  _deserializeContainer(serializedContainer: Object): Container {
    const container = new Container(serializedContainer.id, this)

    container.updateId = serializedContainer.updateId
    container.config = serializedContainer.config
    container.state = serializedContainer.state
    container.changeTs = serializedContainer.changeTs
    container.changeErrMsg = serializedContainer.changeErrMsg
    container.pendingChange = serializedContainer.pendingChange
    container.pendingUpdateId = serializedContainer.pendingUpdateId
    container.pendingConfig = serializedContainer.pendingConfig
    container.updateAttemptCount = serializedContainer.updateAttemptCount
    container.lastAttemptedUpdateId = serializedContainer.lastAttemptedUpdateId

    return container
  }

  _deserializeExec(serializedExec: Object): Exec {
    const exec = new Exec(serializedExec.id, this)

    exec.updateId = serializedExec.updateId
    exec.config = serializedExec.config
    exec.state = serializedExec.state
    exec.changeTs = serializedExec.changeTs
    exec.changeErrMsg = serializedExec.changeErrMsg
    exec.pendingChange = serializedExec.pendingChange
    exec.pendingUpdateId = serializedExec.pendingUpdateId
    exec.pendingConfig = serializedExec.pendingConfig
    exec.updateAttemptCount = serializedExec.updateAttemptCount
    exec.lastAttemptedUpdateId = serializedExec.lastAttemptedUpdateId

    return exec
  }

  async _saveDockerState() {
    this.info('Saving docker state...')

    // this.info(this._containers)

    const serializedContainers = []
    for (const container of this._containers) {
      switch (container.state) {
        case 'running':
        case 'stopped':
        case 'down':
        case 'error':
        case 'removeFail':
          serializedContainers.push(container.serialize())
          break
        default:
          break
      }
    }
    const serializedExecs = []
    for (const exec of this._execs) {
      switch (exec.state) {
        case 'running':
        case 'stopped':
        case 'down':
        case 'error':
        case 'removeFail':
          serializedExecs.push(exec.serialize())
          break
        default:
          break
      }
    }
    const dockerState = {
      containers: serializedContainers,
      execs: serializedExecs
    }
    this.debug('Docker state: ' + JSON.stringify(dockerState, null, 2))
    try {
      fs.writeFileSync(
        this._stateDockerPath,
        JSON.stringify(dockerState),
        'utf8'
      )
    } catch (err) {
      this.error('Failed to save docker state: ' + err.message)
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

    // this.debug('Assets state change: ' + JSON.stringify(desiredState, null, 2))

    // handle changes for containers
    this._handleContainersDesiredStateUpdate(desiredState.containers || {})
    // handle changes for execs
    this._handleExecsDesiredStateUpdate(desiredState.execs || {})

    this._updateDockerReportedState()
    this._processPendingChanges()
  }

  async _handleContainersDesiredStateUpdate(desiredContainers) {
    for (const desiredContainerId in desiredContainers) {
      if (!desiredContainers.hasOwnProperty(desiredContainerId)) {
        continue
      }
      let desiredContainer = desiredContainers[desiredContainerId]

      // determinate containers required of change
      for (let container of this._containers) {
        if (container.id() === desiredContainerId) {
          if (
            (!container.pendingChange &&
              container.updateId !== desiredContainer.updateId) ||
            ((container.pendingChange === 'start' ||
              container.pendingChange === 'stop') &&
              container.pendingUpdateId !== desiredContainer.updateId) ||
            container.pendingChange === 'remove'
          ) {
            container.setPendingChange(
              'deploy',
              desiredContainer.updateId,
              desiredContainer.config
            )
          }
          break
        }
      }
    }
    // find containers to remove
    for (let container of this._containers) {
      if (!desiredContainers.hasOwnProperty(container.id())) {
        container.setPendingChange('remove', null, null)
      }
    }
  }

  async _handleExecsDesiredStateUpdate(desiredExecs) {}

  _updateDockerReportedState() {
    const reportedState = this._deviceStateMan.getState('reported', 'docker')
    if (!reportedState) {
      this.info('NOT UPDATING REPORTED STATE')
      return
    }
    this.info('UPDATING REPORTED STATE')

    this.debug(
      'Docker reported state: ' + JSON.stringify(reportedState, null, 2)
    )

    if (reportedState.containers) {
      // Remove reported assets that no longer exist
      for (const reportedContainerId in reportedState.containers) {
        if (!reportedState.containers.hasOwnProperty(reportedContainerId)) {
          continue
        }
        let found = false
        for (let container of this._containers) {
          if (container.id() === reportedContainerId) {
            found = true
            break
          }
        }
        if (!found) {
          this._removeContainerReportedState(reportedContainerId)
        }
      }
    }

    // Update all current assets (if required)
    for (let container of this._containers) {
      this._updateContainerReportedState(container)
    }

    if (reportedState.execs) {
      // Remove reported assets that no longer exist
      for (const reportedExecId in reportedState.execs) {
        if (!reportedState.execs.hasOwnProperty(reportedExecId)) {
          continue
        }
        let found = false
        for (let exec of this._execs) {
          if (exec.id() === reportedExecId) {
            found = true
            break
          }
        }
        if (!found) {
          this._removeExecReportedState(reportedExecId)
        }
      }
    }
    // Update all current assets (if required)
    for (let exec of this._execs) {
      this._updateExecReportedState(exec)
    }
  }

  _removeContainerReportedState(containerId: string) {
    if (!this._deviceStateMan.canUpdateState('reported')) {
      return
    }

    this.debug(`Removing container '${containerId}' reported state`)
    this._deviceStateMan.updateState(
      'reported',
      'remove',
      'docker.containers.' + containerId
    )
  }

  _removeExecReportedState(execId: string) {
    if (!this._deviceStateMan.canUpdateState('reported')) {
      return
    }

    this.debug(`Removing exec '${execId}' reported state`)
    this._deviceStateMan.updateState(
      'reported',
      'remove',
      'docker.execs.' + execId
    )
  }

  async sync(type, item) {
    switch (type) {
      case 'container':
        this._updateContainerReportedState(item)
        break
      case 'exec':
        this._updateExecReportedState(item)
        break
      default:
        return
    }

    await this._saveDockerState()
  }

  // Only updates the reported state if required (if there is a difference)
  _updateContainerReportedState(container: Container) {
    if (!this._deviceStateMan.canUpdateState('reported')) {
      this.info('NOT UPDATING DESIRED STATE')
      return
    }
    this.info('UPDATING DESIRED STATE')

    // Create new reported state
    let state
    if (container.pendingChange) {
      switch (container.pendingChange) {
        case 'start':
          state = 'startPending'
          break
        case 'stop':
          state = 'stopPending'
          break
        case 'remove':
          state = 'removePending'
          break
        default:
          state = 'unknown'
          break
      }
    } else {
      state = container.state
    }
    let newStateObj = {
      ts: container.changeTs,
      state: state
    }
    if (container.changeErrMsg) {
      newStateObj.message = container.changeErrMsg
    }
    if (container.pendingChange) {
      newStateObj.pendingUpdateId = container.pendingUpdateId
    }
    if (state === 'starting' || state === 'stopping') {
      newStateObj.updateAttemptCount = container.updateAttemptCount
    }
    if (container.config) {
      newStateObj.config = container.config
    }
    newStateObj.updateId = container.updateId

    // Compare with currently reported state
    const currentStateObj = this._getReportedContainerState(container.id())
    if (
      currentStateObj &&
      objectHash(currentStateObj) === objectHash(newStateObj)
    ) {
      this.info(
        `Update of container '${container.name()}' reported state not required`
      )
      return
    }
    // this.info('CURRENT STATE OBJECT ', newStateObj)

    // Update if required
    this.debug(`Updating container '${container.name()}' reported state...`)
    // this.debug('Current state: ' + util.inspect(currentStateObj))
    // this.debug('New state: ' + util.inspect(newStateObj))
    this._deviceStateMan.updateState(
      'reported',
      'set',
      'docker.containers.' + container.id(),
      newStateObj
    )
  }

  // Only updates the reported state if required (if there is a difference)
  _updateExecReportedState(exec: Exec) {
    if (!this._deviceStateMan.canUpdateState('reported')) {
      this.info('NOT UPDATING DESIRED STATE EXEC')
      return
    }
    this.info('UPDATING DESIRED STATE EZEX')

    // Create new reported state
    let state
    if (exec.pendingChange) {
      switch (exec.pendingChange) {
        case 'start':
          state = 'startPending'
          break
        case 'stop':
          state = 'stopPending'
          break
        case 'remove':
          state = 'removePending'
          break
        default:
          state = 'unknown'
          break
      }
    } else {
      state = exec.state
    }
    let newStateObj = {
      ts: exec.changeTs,
      state: state
    }
    if (exec.changeErrMsg) {
      newStateObj.message = exec.changeErrMsg
    }
    if (exec.pendingChange) {
      newStateObj.pendingUpdateId = exec.pendingUpdateId
    }
    if (state === 'starting' || state === 'stopping') {
      newStateObj.updateAttemptCount = exec.updateAttemptCount
    }
    if (exec.config) {
      newStateObj.config = exec.config
    }
    newStateObj.updateId = exec.updateId

    // Compare with currently reported state
    const currentStateObj = this._getReportedExecState(exec.id())
    if (
      currentStateObj &&
      objectHash(currentStateObj) === objectHash(newStateObj)
    ) {
      this.info(`Update of exec '${exec.name()}' reported state not required`)
      return
    }
    // this.info('CURRENT STATE OBJECT ', newStateObj)

    // Update if required
    this.debug(`Updating container '${exec.name()}' reported state...`)
    // this.debug('Current state: ' + util.inspect(currentStateObj))
    // this.debug('New state: ' + util.inspect(newStateObj))
    this._deviceStateMan.updateState(
      'reported',
      'set',
      'docker.execs.' + exec.id(),
      newStateObj
    )
  }

  _getReportedContainerState(containerId: string): ?Object {
    const reportedState = this._deviceStateMan.getState('reported', 'docker')
    if (!reportedState || !reportedState.containers) {
      return null
    }

    return reportedState.containers[containerId]
  }

  _getReportedExecState(execId: string): ?Object {
    const reportedState = this._deviceStateMan.getState('reported', 'docker')
    if (!reportedState || !reportedState.execs) {
      return null
    }

    return reportedState.execs[execId]
  }

  _getFirstPendingChangeContainer(): ?Container {
    if (this._containers.length < 1) {
      return null
    }
    for (let container of this._containers) {
      if (container.pendingChange) {
        return container
      }
    }
    return null
  }

  _getFirstPendingChangeExec(): ?Exec {
    if (this._execs.length < 1) {
      return null
    }
    for (let exec of this._execs) {
      if (exec.pendingChange) {
        return exec
      }
    }
    return null
  }

  _setContainerState(container: Container, state: string) {
    container.setState(state)
    this._updateContainerReportedState(container)
  }

  _setExecState(exec: Exec, state: string) {
    exec.setState(state)
    this._updateExecReportedState(exec)
  }

  async _processPendingChanges() {
    if (this._processingChanges) {
      return
    }
    this._processingChanges = true

    while (this._active) {
      let container = this._getFirstPendingChangeContainer()
      if (!container) {
        break
      }

      // Dequeue the pending change
      let pendingChange = container.pendingChange
      let pendingUpdateId = container.pendingUpdateId
      let pendingConfig = container.pendingConfig
      container.pendingChange = null
      container.pendingUpdateId = null
      container.pendingConfig = null

      // Reset update attempt count if this is a different update
      if (pendingUpdateId !== container.lastAttemptedUpdateId) {
        container.lastAttemptedUpdateId = pendingUpdateId
        container.updateAttemptCount = 0
      }

      // Process the change
      switch (pendingChange) {
        case 'start': {
          // Save current state so we can revert back to it if required
          const prevState = container.state
          const prevConfig = container.config
          const prevUpdateId = container.updateId

          // Apply the update and attempt deploy
          container.updateId = pendingUpdateId
          container.config = pendingConfig
          container.updateAttemptCount++
          this._setContainerState(container, 'starting')
          let success = await container.start()
          if (!success) {
            if (container.updateAttemptCount < this._updateAttemptsMax) {
              if (container.pendingChange === null) {
                this.info(
                  `Starting failed, but will retry (${
                    container.updateAttemptCount
                  }/${this._updateAttemptsMax}).`
                )
                container.setPendingChange(
                  pendingChange,
                  pendingUpdateId,
                  pendingConfig
                )
              } else {
                this.info('Starting failed, but new change already pending.')
              }
              container.updateId = prevUpdateId
              container.config = prevConfig
              // Note that setting it back to prevConfig may be a lie as it may
              // have been 'removed', but it's ok for now to keep things simple.
              this._setContainerState(container, prevState)
            } else {
              this.info(
                `Starting failed maximum number of times (${
                  container.updateAttemptCount
                })`
              )
              this._setContainerState(container, 'error')
            }
          } else {
            this._setContainerState(container, 'running')
          }
          break
        }
        case 'stop': {
          // Save current state so we can revert back to it if required
          const prevState = container.state
          const prevConfig = container.config
          const prevUpdateId = container.updateId

          // Apply the update and attempt deploy
          container.updateId = pendingUpdateId
          container.config = pendingConfig
          container.updateAttemptCount++
          this._setContainerState(container, 'stopping')
          let success = await container.stop()
          if (!success) {
            if (container.updateAttemptCount < this._updateAttemptsMax) {
              if (container.pendingChange === null) {
                this.info(
                  `Stopping failed, but will retry (${
                    container.updateAttemptCount
                  }/${this._updateAttemptsMax}).`
                )
                container.setPendingChange(
                  pendingChange,
                  pendingUpdateId,
                  pendingConfig
                )
              } else {
                this.info('Stopping failed, but new change already pending.')
              }
              container.updateId = prevUpdateId
              container.config = prevConfig
              // Note that setting it back to prevConfig may be a lie as it may
              // have been 'removed', but it's ok for now to keep things simple.
              this._setContainerState(container, prevState)
            } else {
              this.info(
                `Stopping failed maximum number of times (${
                  container.updateAttemptCount
                })`
              )
              this._setContainerState(container, 'error')
            }
          } else {
            this._setContainerState(container, 'running')
          }
          break
        }
        case 'remove':
          if (
            container.state === 'started' ||
            container.state === 'stopped' ||
            container.state === 'error'
          ) {
            this._setContainerState(container, 'removing')
            let success = await container.remove()
            if (!success) {
              this._setContainerState(container, 'removeFail')
              break
            }
          }
          this._removeContainerReportedState(container.id())
          // The asset may have received a new pendingChange again while we were
          // await'ing, so check for that before we really remove it.
          if (!container.pendingChange) {
            this._containers = this._container.filter(a => {
              return a !== container
            })
          }
          break

        default:
          this.error('Unsupported pending change: ' + pendingChange)
          break
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
      throw new Error('Attempted to activate docker-man when not initialized')
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
    this._containers.push(container)
  }

  async _startContainers() {
    this.info('Starting containers...')
    await Promise.all(
      this._containers.map(async (container, idx) => {
        const success = await this._wakeContainer(container)
        if (success && container.models().length > 0) {
          this.info(`Starting execs of container ${container.name()}...`)
          for (const modelId of container.models()) {
            const exec = this.getExec(modelId)
            await container.wakeExec(exec)
          }
        }
      })
    )
  }

  getExec(key) {
    return this._execs.find(exec => exec.id() === key)
  }

  removeExec(key) {
    this._execs = this._execs.filter(exec => exec.id() !== key)
  }

  removeContainer(key) {
    this._containers = this._containers.filter(
      container => container.id() !== key
    )
  }

  getContainer(key) {
    return this._docker.getContainer(key)
  }

  async _wakeContainer(container) {
    if (!container.canStart()) {
      return
    }
    this.debug('Waking up container : ', container.containerId())
    let success
    // Find and start container
    try {
      const existingContainer = this.getContainer(container.containerId())
      container.activate(existingContainer)
      success = await container.start()
    } catch (err) {
      success = false
    }
    if (!success) {
      // Recreate container based on existing data
      try {
        await container.repair()
        success = await container.start()
      } catch (err) {
        success = false
      }
    }
    return success
  }

  async startContainer(container) {
    if (!container.canStart()) {
      return
    }
    const containerId = container.containerId()
    this.debug('Starting container : ', containerId)
    let existingContainer
    try {
      existingContainer = this.getContainer(containerId)
    } catch (err) {
      throw new Error('Container does not exist')
    }
    try {
      container.activate(existingContainer)
      await container.start()
      await existingContainer.start()
      this._attachLogsToContainer(existingContainer, container)
      this._setContainerState(container, 'running')
      return existingContainer
    } catch (err) {
      if (err.statusCode === 304) {
        this._setContainerState(container, 'running')
        return existingContainer
      }
      if (err.statusCode === 404) {
        return this._recreateContainer(container.config, container)
          .then(newContainer => {
            this._transferContainer(containerId, newContainer.id)
            return newContainer
          })
          .catch(err => {
            this.error('Failed to recreate a container')
            this.error(err.message)

            this._cleanContainer(containerId)
            this._removeContainerReportedState(container.id())
          })
      }
      this.error(err.message)
      throw new Error('Cannot start a container')
    }
  }

  async stopContainer(containerId) {
    this.debug('Stopping container: ', containerId)
    try {
      const container = this.getContainer(containerId)
      await container.stop()
      return true
    } catch (err) {
      this.error(err.message)
      return false
    }
  }

  _cleanContainer(containerId) {
    this.debug('Cleaning container ', containerId)
    this._containers = this._containers.filter(
      container => container.id !== containerId
    )
  }

  _transferContainer(oldId, newId) {
    const container = this._containers.find(
      container => container.containerId() === oldId
    )
    container.transfer(newId)
  }

  async shutDown() {
    this.info('Shuting down all running containers')
    try {
      await Promise.all(this._containers.map(container => container.shutDown()))
    } catch (err) {
      this.error('Shuting down containers error', err.message)
    }
  }

  async stopContainers() {
    this.info('Stopping all running containers')
    try {
      await Promise.all(
        this._containers
          .filter(container => container.state === 'running')
          .map(container => {
            this.getContainer(container.containerId())
              .stop()
              .catch(err => {
                if (err.statusCode !== 304) {
                  this.error(err)
                }
              })
          })
      )
      await this._saveDockerState()
    } catch (err) {
      this.error('Stopping containers error', err.message)
    }
    // return this._docker
    //   .listContainers()
    //   .then(containers => {
    //     return Promise.all(
    //       containers.map(containerInfo =>
    //         this._docker.getContainer(containerInfo.Id).stop()
    //       )
    //     )
    //   })
    //   .catch(err => {
    //     this.info('STOPPING CONTAINERS ERROR', err)
    //   })
  }

  async listContainers() {
    // const socket = process.env.DOCKER_SOCKET || '/var/run/docker.sock'
    // const stats = fs.statSync(socket)
    // if (!stats.isSocket()) {
    //   throw new Error('Are you sure the docker is running?')
    // }
    return this._docker
      .listContainers()
      .then(containers => {
        this.info('**********************************************')
        this.info('CONTAINERs: ')
        this.info(JSON.stringify(containers, null, 2))
        this.info('ALL: ' + containers.length)
      })
      .catch(err => {
        this.info('???????????????????????????????????????')
        this.info('ERROR: ' + err)
        this.info('???????????????????????????????????????')
      })
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
          // this._runImage(repoTag)
          resolve(output)
        }
        const onProgress = ({ status, progress }) => {
          this.info(status)
          if (progress) {
            this.info(progress)
          }
        }
        this._docker.modem.followProgress(stream, onFinished, onProgress)
        // this._log.info(stream)
      })
    })
  }

  async checkExistingContainer(imageName, modelId) {
    let alreadyRunning = false
    const container = this._containers.filter(container => {
      if (
        container.state === 'running' &&
        container.config.imageName === imageName
      ) {
        if (container.models().find(model => model.modelId === modelId)) {
          alreadyRunning = true
          return true
        } else {
          return container.isAccepting()
        }
      } else {
        return false
      }
    })[0]
    if (container) {
      return { container, alreadyRunning }
    } else {
      return null
    }
  }

  async _recreateContainer(containerConfig, stateContainer) {
    this.info('Recreating a container')
    const { mounts, cmd, ports, imageName } = containerConfig
    const config = {
      HostConfig: {
        Binds: mounts,
        Privileged: true
      },
      Image: imageName,
      Cmd: cmd,
      Tty: true
    }
    if (ports) {
      config.HostConfig.PortBindings = {}
      config.ExposedPorts = {}
      Object.keys(ports).forEach(port => {
        config.HostConfig.PortBindings[port] = [{ HostPort: ports[port] }]
        config.ExposedPorts[port] = {}
      })
    }
    const container = await this._docker
      // .run(imageName, options, process.stdout, { cmd: '/bin/bash' })
      .createContainer(config)
      .then(container => {
        this.info('===========RUN?=============')
        this._log.info(container)
        return container.start().then(() => {
          this.info('~~~~~~STARTED CONTAINER~~~~~~~')
          this._attachLogsToContainer(container, stateContainer)
          return container
        })
      })
      .catch(err => {
        this.info('================RUN ERROR=========', err)
      })
    return container
  }

  async createContainer(config) {
    return this._docker.createContainer(config)
  }

  async _checkExistingModels(modelId, useExistingContainer) {
    // checking if model is already running
  }

  async _checkRunningModel(config) {
    const { modelId } = config
    try {
      await Promise.all(
        this._containers
          .filter(
            container =>
              container.state === 'running' &&
              container.models().includes(modelId)
          )
          .map(async container => {
            if (container.models().length <= 1) {
              await this.removeContainer(container.containerId())
            }
          })
      )
      await this._saveDockerState()
    } catch (err) {
      this.error('Checking containers error', err.message)
    }
  }

  _checkExistingModel(modelId) {
    this.info('Checking if model is already running...')
    try {
      const exec = this.getExec(modelId)
      return exec
    } catch (err) {
      this.error('Checking containers error', err.message)
    }
  }

  _checkExistingContainer(imageName) {
    this.info('Checking for existing container...')
    return this._containers.find(
      container =>
        container.state === 'running' &&
        container.imageName() === imageName &&
        container.isAccepting()
    )
  }

  async prepare(config) {
    const { modelId, useExistingContainer, imageName } = config

    const existingExec = this._checkExistingModel(modelId)
    if (existingExec) {
      this.info('Running model found... Removing')
      await existingExec.remove(true)
      this.removeExec(config.modelId)
    }
    if (useExistingContainer) {
      const container = this._checkExistingContainer(imageName)
      if (container) {
        this.info(`Found existing container ${container.name()}`)

        return {
          exist: true,
          mountDir: container.mountDir(),
          port: container.freePort(),
          container: container
        }
      } else {
        this.info('No suitable container found')
      }
    }
    return { exist: false }
  }

  async createNewContainer(imageName, dockerOptions, modelConfig) {
    // pulling docker image
    await this.pullImage(imageName)
    this.info('Creating container')
    const { mounts, cmd, ports } = dockerOptions
    const config = {
      HostConfig: {
        Binds: mounts,
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
    this.debug(JSON.stringify(config, null, 2))
    const dockerContainer = await this._docker.createContainer(config)

    this.info('~~~~~~STARTED CONTAINER~~~~~~~')

    const newContainer = new Container(dockerContainer.id, this)
    const containerConfig = {
      containerId: dockerContainer.id,
      imageName: imageName,
      models: [],
      mountDir: modelConfig.mountDir,
      accept: modelConfig.cacheSize,
      ports: modelConfig.ports,
      cacheSize: modelConfig.cacheSize,
      dockerOptions
    }
    newContainer.config = containerConfig

    this.addContainer(newContainer)
    this.info('BEFORE ACTIVATE')
    newContainer.activate(dockerContainer)

    return newContainer
  }

  async createExec(container, options) {
    this.info('Creating new execution to a container')
    const exec = await container.exec(options)
    return exec
  }

  addExec(exec) {
    this._execs.push(exec)
  }

  async exec(container, options) {
    this.info('Creating new execution to a container')
    const exec = await container.exec(options)
    exec.start((err, stream) => {
      if (err) {
        return this.error(err.message)
      }

      this._attachLogsToExec(container, stream)
    })
  }

  _attachLogsToExec(container, execStream) {
    const logStream = new stream.PassThrough()
    logStream.on('data', chunk => {
      this.info('exec container: ', chunk.toString('utf-8'))
    })

    container.modem.demuxStream(execStream, logStream, logStream)
    execStream.on('end', function() {
      logStream.end('!stop exec!')
    })
  }

  _attachLogsToContainer(dockerContainer, stateContainer) {
    const logStream = new stream.PassThrough()
    logStream.on('data', chunk => {
      this.info('docker container: ', chunk.toString('utf-8'))
    })
    dockerContainer.logs(
      {
        follow: true,
        stdout: true,
        stderr: true
      },
      (err, stream) => {
        if (err) {
          return this.error(err.message)
        }
        dockerContainer.modem.demuxStream(stream, logStream, logStream)
        stream.on('end', () => {
          if (this._active) {
            this.error('Unexpected stopping of a container', this._active)
            this._setContainerState(stateContainer, 'error')
          }
          logStream.end('!stop container!')
        })
      }
    )
  }
}
