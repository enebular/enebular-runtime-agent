import Docker from 'dockerode'
import stream from 'stream'
import type { Logger } from 'winston'

export default class DockerManager {
  _log: Logger
  _docker: Docker

  constructor(log: Logger) {
    this._log = log
    // var socket = process.env.DOCKER_SOCKET || '/var/run/docker.sock'
    // var stats = fs.statSync(socket)
    // var stats2 = fs.statSync(dockerHost)

    // // this._log.info('STATS:' + stats)
    // this._log.info('STATS2:' + stats2)
    this._docker = new Docker()
  }

  getContainer(key) {
    return this._docker.getContainer(key)
  }

  async stopContainers() {
    this._log.info('STOPPING ALL RUNNING DOCKER CONTAINERS')
    return this._docker
      .listContainers()
      .then(containers => {
        return Promise.all(
          containers.map(containerInfo =>
            this._docker.getContainer(containerInfo.Id).stop()
          )
        )
      })
      .catch(err => {
        this._log.info('STOPPING CONTAINERS ERROR', err)
      })
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
        this._log.info('**********************************************')
        this._log.info('CONTAINERs: ')
        this._log.info(JSON.stringify(containers, null, 2))
        this._log.info('ALL: ' + containers.length)
      })
      .catch(err => {
        this._log.info('???????????????????????????????????????')
        this._log.info('ERROR: ' + err)
        this._log.info('???????????????????????????????????????')
      })
  }

  async pullImage(repoTag, options) {
    return new Promise((resolve, reject) => {
      this._log.info('Pulling image: ', repoTag)
      this._docker.pull(repoTag, (err, stream) => {
        if (err) {
          this._log.error(err)
          reject(err)
        }
        const onFinished = (err, output) => {
          if (err) {
            this._log.info(err)
            reject(err)
          }

          this._log.info('Finished pulling image: ', repoTag)
          // this._runImage(repoTag)
          resolve(output)
        }
        const onProgress = ({ status, progress }) => {
          this._log.info(status)
          if (progress) {
            this._log.info(progress)
          }
        }
        this._docker.modem.followProgress(stream, onFinished, onProgress)
        // this._log.info(stream)
      })
    })
  }

  async createContainer(imageName, options) {
    this._log.info('Creating container')
    // this._log.info('OPTIONS:', JSON.stringify(options, null, 2))
    const { mounts, cmd, ports } = options
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
        this._log.info('===========RUN?=============')
        // this._log.info(container)
        return container.start().then(() => {
          this._log.info('~~~~~~STARTED CONTAINER~~~~~~~')
          this._attachLogsToContainer(container)
          return container
        })
      })
      .catch(err => {
        this._log.info('================RUN ERROR=========', err)
      })
    return container
  }

  async exec(container, options) {
    this._log.info('Creating new execution to a container')
    const exec = await container.exec(options)
    exec.start((err, stream) => {
      if (err) {
        return this._log.error(err.message)
      }

      this._attachLogsToExec(container, stream)
    })
  }

  _attachLogsToExec(container, execStream) {
    const logStream = new stream.PassThrough()
    logStream.on('data', chunk => {
      this._log.info('exec container: ', chunk.toString('utf-8'))
    })

    container.modem.demuxStream(execStream, logStream, logStream)
    execStream.on('end', function() {
      logStream.end('!stop exec!')
    })
  }

  _attachLogsToContainer(container) {
    const logStream = new stream.PassThrough()
    logStream.on('data', chunk => {
      this._log.info('docker container: ', chunk.toString('utf-8'))
    })
    container.logs(
      {
        follow: true,
        stdout: true,
        stderr: true
      },
      (err, stream) => {
        if (err) {
          return this._log.error(err.message)
        }
        container.modem.demuxStream(stream, logStream, logStream)
        stream.on('end', () => {
          logStream.end('!stop container!')
        })
      }
    )
  }
}
