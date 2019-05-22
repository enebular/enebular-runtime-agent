import fs from 'fs'
import objectHash from 'object-hash'
import path from 'path'
import Docker from 'dockerode'
import type { Logger } from 'winston'
import { delay } from './utils'
import Container from './container'
import type AgentInfoManager from './agent-info-manager'

const moduleName = 'docker-man'

export default class DockerManager {
  _test: boolean = false
  _deviceStateMan: DeviceStateManager
  _agentInfoMan: AgentInfoManager
  _log: Logger
  _docker: Docker
  _aiModelDir: string
  _containers: Array<Container> = []
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

    if (config.get('ENEBULAR_DOCKER_MODE')) {
      this._test = true
    }
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
    const dockerState = JSON.parse(data)
    const serializedContainers = dockerState.containers
    for (const serializedContainer of serializedContainers) {
      const container = this._deserializeContainer(serializedContainer)
      this._containers.push(container)
    }
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
    container.updateAttemptCount = serializedContainer.updateAttemptCount
    container.lastAttemptedUpdateId = serializedContainer.lastAttemptedUpdateId

    return container
  }

  async _saveDockerState() {
    this.info('Saving docker state...')

    // this.info(this._containers)

    const serializedContainers = []
    for (const container of this._containers) {
      switch (container.state) {
        case 'starting':
        case 'stopping':
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
    const dockerState = {
      containers: serializedContainers
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

    this.debug('Assets state change: ' + JSON.stringify(desiredState, null, 2))

    // handle changes for containers
    this._handleContainersDesiredStateUpdate(desiredState.containers || {})

    this._updateDockerReportedState()
    this._processPendingChanges()
  }

  async _handleContainersDesiredStateUpdate(desiredContainers) {
    this.info('HANDLE CONTAINER DESIRED STATE UPDATE')
    for (const desiredContainerId in desiredContainers) {
      if (!desiredContainers.hasOwnProperty(desiredContainerId)) {
        continue
      }
      let desiredContainer = desiredContainers[desiredContainerId]

      // determinate containers required of change
      for (let container of this._containers) {
        this.info(
          `~~~~~~~~~~~~~~ desiredContainer ~~~~~~~~~~~~~~`,
          JSON.stringify(desiredContainer, null, 2)
        )
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
              desiredContainer.state,
              desiredContainer.updateId
            )
          }
          break
        }
      }
    }
    // find containers to remove
    for (let container of this._containers) {
      if (!desiredContainers.hasOwnProperty(container.id())) {
        container.setPendingChange('remove', null)
      }
    }
  }

  _updateDockerReportedState() {
    const reportedState = this._deviceStateMan.getState('reported', 'docker')
    if (!reportedState) {
      // this.info('NOT UPDATING REPORTED STATE')
      return
    }
    // this.info('UPDATING REPORTED STATE')

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

  async sync(type, item) {
    switch (type) {
      case 'container':
        this._updateContainerReportedState(item)
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

  _getReportedContainerState(containerId: string): ?Object {
    const reportedState = this._deviceStateMan.getState('reported', 'docker')
    if (!reportedState || !reportedState.containers) {
      return null
    }

    return reportedState.containers[containerId]
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

  _setContainerState(container: Container, state: string) {
    container.setState(state)
    this._updateContainerReportedState(container)
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
      container.pendingChange = null
      container.pendingUpdateId = null

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
          const prevUpdateId = container.updateId

          // Apply the update and attempt deploy
          container.updateId = pendingUpdateId
          container.updateAttemptCount++
          container.setState('starting')
          let success = await container.start()
          if (!success) {
            if (container.updateAttemptCount < this._updateAttemptsMax) {
              if (container.pendingChange === null) {
                this.info(
                  `Starting failed, but will retry (${
                    container.updateAttemptCount
                  }/${this._updateAttemptsMax}).`
                )
                container.setPendingChange(pendingChange, pendingUpdateId)
              } else {
                this.info('Starting failed, but new change already pending.')
              }
              container.updateId = prevUpdateId
              // Note that setting it back to prevConfig may be a lie as it may
              // have been 'removed', but it's ok for now to keep things simple.
              container.setState(prevState)
            } else {
              this.info(
                `Starting failed maximum number of times (${
                  container.updateAttemptCount
                })`
              )
              container.setState('error')
            }
          } else {
            container.setState('running')
          }
          break
        }
        case 'stop': {
          // Save current state so we can revert back to it if required
          const prevState = container.state
          const prevUpdateId = container.updateId

          // Apply the update and attempt deploy
          container.updateId = pendingUpdateId
          container.updateAttemptCount++
          container.setState('stopping')
          let success = await container.stop()
          if (!success) {
            if (container.updateAttemptCount < this._updateAttemptsMax) {
              if (container.pendingChange === null) {
                this.info(
                  `Stopping failed, but will retry (${
                    container.updateAttemptCount
                  }/${this._updateAttemptsMax}).`
                )
                container.setPendingChange(pendingChange, pendingUpdateId)
              } else {
                this.info('Stopping failed, but new change already pending.')
              }
              container.updateId = prevUpdateId
              // Note that setting it back to prevConfig may be a lie as it may
              // have been 'removed', but it's ok for now to keep things simple.
              container.setState(prevState)
            } else {
              this.info(
                `Stopping failed maximum number of times (${
                  container.updateAttemptCount
                })`
              )
              container.setState('error')
            }
          } else {
            container.setState('stopped')
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
    this._containers.push(container)
  }

  async _startContainers() {
    this.info('Starting containers...')
    await Promise.all(
      this._containers.map(async (container, idx) => {
        const success = await this._wakeContainer(container)
        if (!success) {
          this.error(`Could not start a container ${container.name()}...`)
        }
      })
    )
  }

  removeContainer(key) {
    this._containers = this._containers.filter(
      container => container.id() !== key
    )
    this._removeContainerReportedState(key)
  }

  getContainer(key) {
    return this._docker.getContainer(key)
  }

  container(key) {
    return this._containers.find(container => container.id() === key)
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
      this.error('Checking containers error', err.message)
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

  async createNewContainer(createOptions, modelConfig) {
    this.info('Creating container')
    const { mounts, ports, imageName, cmd, cores, maxRam } = createOptions
    const { mountDir, port, handlers, language, id, name } = modelConfig
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
    this.debug(JSON.stringify(config, null, 2))
    const dockerContainer = await this._docker.createContainer(config)

    const newContainer = new Container(id, this)
    const containerConfig = {
      name,
      containerId: dockerContainer.id,
      mountDir: mountDir,
      port: port,
      handlers,
      language,
      createOptions
    }
    newContainer.config = containerConfig

    this.addContainer(newContainer)
    newContainer.activate(dockerContainer)

    return newContainer
  }
}
