import fs from 'fs'
import Docker from 'dockerode'
import stream from 'stream'
import type { Logger } from 'winston'

const moduleName = 'docker-man'

export default class DockerManager {
  _log: Logger
  _docker: Docker
  _containers: Array<Container> = []
  _inited: boolean = false

  constructor(config: Config, log: Logger) {
    this._log = log

    this._stateDockerPath = config.get('ENEBULAR_DOCKER_STATE_PATH')
    if (!this._stateDockerPath) {
      throw new Error('Missing dockers-man configuration')
    }
    // var socket = process.env.DOCKER_SOCKET || '/var/run/docker.sock'
    // var stats = fs.statSync(socket)
    // var stats2 = fs.statSync(dockerHost)

    // // this._log.info('STATS:' + stats)
    // this._log.info('STATS2:' + stats2)
    this._docker = new Docker()
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

    this.debug('Docker state path: ' + this._stateDockerPath)

    await this._init()

    this._inited = true
  }

  async _init() {
    await this._loadContainers()
    await this._startContainers()
    await this._saveDockerState()
  }

  async _loadContainers() {
    if (!fs.existsSync(this._stateDockerPath)) {
      return
    }
    this.info('Loading docker state: ' + this._stateDockerPath)
    const data = fs.readFileSync(this._stateDockerPath, 'utf8')
    let serializedContainers = JSON.parse(data)
    for (let serializedContainer of serializedContainers) {
      let container = this._deserializeContainer(serializedContainer)
      this._containers.push(container)
    }
  }

  _deserializeContainer(serializedContainer: Object): Container {
    let container = {}

    container.id = serializedContainer.id
    container.image = serializedContainer.image
    container.options = serializedContainer.options
    container.config = serializedContainer.config
    container.status = serializedContainer.status
    container.mountDir = serializedContainer.mountDir
    container.port = serializedContainer.port
    container.models = serializedContainer.models
    container.accept = serializedContainer.accept

    return container
  }

  _saveDockerState() {
    this.debug('Saving docker state...')

    let serializedContainer = []
    for (let container of this._containers) {
      serializedContainer.push(container)
    }
    this.debug('Docker state: ' + JSON.stringify(serializedContainer, null, 2))
    try {
      fs.writeFileSync(
        this._stateDockerPath,
        JSON.stringify(serializedContainer),
        'utf8'
      )
    } catch (err) {
      this.error('Failed to save docker state: ' + err.message)
    }
  }

  async _addContainer(containerId, image, options, config) {
    const newContainer = {
      id: containerId,
      status: 'running',
      image,
      options,
      config,
      models: [config.modelId],
      mountDir: config.mountDir,
      accept: config.cacheSize - 1,
      port: config.port
    }
    this._containers.push(newContainer)
    await this._saveDockerState()
  }

  async _addModelToContainer(containerId, modelId) {
    this._containers = this._containers.map(container => {
      if (container.id === containerId) {
        return {
          ...container,
          models: container.models.concat(modelId),
          accept: container.accept - 1
        }
      } else {
        return container
      }
    })
    await this._saveDockerState()
  }

  async _updateContainersState(containerId, fields) {
    this._containers = this._containers.map(container => {
      if (container.id === containerId) {
        return { ...container, ...fields }
      } else {
        return container
      }
    })
    await this._saveDockerState()
  }

  async _startContainers() {
    this.info('Starting containers')
    await Promise.all(
      this._containers.map(async (container, idx) => {
        const started = await this.startContainer({ id: container.id })
        this._containers[idx].status = started ? 'running' : 'startFailed'
      })
    )
  }

  getContainer(key) {
    return this._docker.getContainer(key)
  }

  async startContainer(options) {
    this.debug('Starting container : ', options.id)
    try {
      const container = this.getContainer(options.id)
      await container.start()
      this._attachLogsToContainer(container)
      return true
    } catch (err) {
      if (err.statusCode === 304) {
        return true
      }
      this.error(err.message)
      return false
    }
  }

  async stopContainer(options) {
    this.debug('Stopping container: ', options.id)
    try {
      const container = this.getContainer(options.id)
      await container.stop()
      return true
    } catch (err) {
      this.error(err.message)
      return false
    }
  }

  async removeContainer(options) {
    this.debug('Removing container: ', options.id)
    try {
      const container = this.getContainer(options.id)
      await container.remove({ force: true })
      this._containers = this._containers.filter(
        container => container.id !== options.id
      )
      return true
    } catch (err) {
      this.error(err.message)
      return false
    }
  }

  async stopContainers() {
    this.info('Stopping all running containers')
    try {
      await Promise.all(
        this._containers
          .filter(container => container.status === 'running')
          .map(container => {
            this.getContainer(container.id).stop()
          })
      )
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

  async _checkRunningModel(config) {
    const { modelId } = config
    try {
      await Promise.all(
        this._containers
          .filter(
            container =>
              container.status === 'running' &&
              container.models.includes(modelId)
          )
          .map(async container => {
            if (container.models.length <= 1) {
              await this.removeContainer(container)
            }
          })
      )
      await this._saveDockerState()
    } catch (err) {
      this.error('Checking containers error', err.message)
    }
  }

  async checkExistingContainer(imageName, modelId) {
    let alreadyRunning = false
    const container = this._containers.filter(container => {
      if (container.status === 'running' && container.image === imageName) {
        if (container.models.includes(modelId)) {
          alreadyRunning = true
          return true
        } else if (container.accept > 0) {
          return true
        } else {
          return false
        }
      } else {
        return false
      }
    })[0]
    if (container) {
      return { ...container, alreadyRunning }
    } else {
      return null
    }
  }

  async createContainer(imageName, dockerOptions, modelConfig) {
    // checking if model is already running
    await this._checkRunningModel(modelConfig)
    // this._log.info('OPTIONS:', JSON.stringify(options, null, 2))
    if (modelConfig.existingContainer) {
      const existing = await this.checkExistingContainer(
        imageName,
        modelConfig.modelId
      )
      if (existing) {
        this.info('Using existing container')
        if (!existing.alreadyRunning) {
          await this._addModelToContainer(existing.id, modelConfig.modelId)
        }
        return this.getContainer(existing.id)
      }
    } // pulling docker image
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
          this._attachLogsToContainer(container)
          this._addContainer(
            container.id,
            imageName,
            dockerOptions,
            modelConfig
          )
          return container
        })
      })
      .catch(err => {
        this.info('================RUN ERROR=========', err)
      })
    return container
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

  _attachLogsToContainer(container) {
    const logStream = new stream.PassThrough()
    logStream.on('data', chunk => {
      this.info('docker container: ', chunk.toString('utf-8'))
    })
    container.logs(
      {
        follow: true,
        stdout: true,
        stderr: true
      },
      (err, stream) => {
        if (err) {
          return this.error(err.message)
        }
        container.modem.demuxStream(stream, logStream, logStream)
        stream.on('end', () => {
          logStream.end('!stop container!')
        })
      }
    )
  }
}
