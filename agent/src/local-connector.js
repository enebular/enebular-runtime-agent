/* @flow */
import net from 'net'
import fs from 'fs'
import { version as agentVer } from '../package.json'
import EnebularAgent from './enebular-agent'
import ConnectorService from './connector-service'

const MODULE_NAME = 'local'
const END_OF_MSG_MARKER = 0x1e // RS (Record Separator)

export default class LocalConnector {
  _agent: EnebularAgent
  _connector: ConnectorService
  _localServer: net.Server
  _clientSocket: ?net.Socket

  _log(level: string, msg: string, ...args: Array<mixed>) {
    args.push({ module: MODULE_NAME })
    this._agent.log.log(level, msg, ...args)
  }

  _debug(msg: string, ...args: Array<mixed>) {
    this._log('debug', msg, ...args)
  }

  _info(msg: string, ...args: Array<mixed>) {
    this._log('info', msg, ...args)
  }

  _error(msg: string, ...args: Array<mixed>) {
    this._log('error', msg, ...args)
  }

  _attemptSocketRemove() {
    try {
      fs.unlinkSync(this._agent.config.get('ENEBULAR_LOCAL_PORT_SOCKET_PATH'))
    } catch (err) {
      // ignore any errors
    }
  }

  _clientSendMessage(message: string) {
    if (this._clientSocket) {
      this._clientSocket.write(message + String.fromCharCode(END_OF_MSG_MARKER))
    }
  }

  async _startLocalServer(connector: ConnectorService): net.Server {
    const localPort = this
    function handleClientMessage(clientMessage: string) {
      localPort._debug(`client message: [${clientMessage}]`)
      let message
      try {
        message = JSON.parse(clientMessage)
        switch (message.type) {
          case 'connect':
            connector.updateConnectionState(true)
            break
          case 'disconnect':
            connector.updateConnectionState(false)
            break
          case 'registration':
            connector.updateRegistrationState(
              message.registration.registered,
              message.registration.deviceId
            )
            break
          case 'message':
            connector.sendMessage(
              message.message.messageType,
              message.message.message
            )
            break
          case 'log':
            localPort._log(message.log.level, message.log.message)
            break
          default:
            localPort._info('unsupported client message type: ' + message.type)
            break
        }
      } catch (err) {
        localPort._error('client message: failed to handle: ' + err)
      }
    }

    const server = net.createServer(socket => {
      this._info('client connected')

      socket.setEncoding('utf8')

      this._clientSocket = socket

      let messages = ''

      socket.on('data', data => {
        messages += data
        if (messages.charCodeAt(messages.length - 1) === END_OF_MSG_MARKER) {
          let msgs = messages.split(String.fromCharCode(END_OF_MSG_MARKER))
          for (let msg of msgs) {
            if (msg.length > 0) {
              handleClientMessage(msg)
            }
          }
          messages = ''
        }
      })

      socket.on('end', () => {
        if (messages.length > 0) {
          this._info('client ended with partial message: ' + messages)
          messages = ''
        }
      })

      socket.on('close', () => {
        this._info('client disconnected')
        this._clientSocket = null
        connector.updateConnectionState(false)
        connector.updateActiveState(false)
      })

      socket.on('error', err => {
        this._info('client socket error: ' + err)
      })

      this._clientSendMessage('ok')
      this._clientSendMessage(
        `agent: {"v": "${agentVer}", "type": "enebular-agent"}`
      )

      connector.updateActiveState(true)
    })

    server.on('listening', () => {
      this._info('server listening on: ' + JSON.stringify(server.address()))
    })

    server.on('error', err => {
      this._error('server error: ' + err)
    })

    server.on('close', () => {
      this._info('server closed')
    })

    this._attemptSocketRemove()
    server.listen(this._agent.config.get('ENEBULAR_LOCAL_PORT_SOCKET_PATH'))

    return server
  }

  onConnectorRegisterConfig() {
    this._agent.config.addItem(
      'ENEBULAR_LOCAL_PORT_SOCKET_PATH',
      `/tmp/enebular-local-agent.socket.${process.pid}`,
      'Local port socket path',
      true
    )
  }

  async onConnectorInit() {
    this._agent.on('connectorRegister', () => {
      this._clientSendMessage('register')
    })

    this._agent.on('connectorConnect', () => {
      this._clientSendMessage('connect')
    })

    this._agent.on('connectorDisconnect', () => {
      this._clientSendMessage('disconnect')
    })

    this._localServer = await this._startLocalServer(this._connector)
  }

  async startup(portBasePath: string) {
    this._connector = new ConnectorService(
      this.onConnectorInit.bind(this),
      this.onConnectorRegisterConfig.bind(this)
    )
    this._agent = new EnebularAgent({
      portBasePath: portBasePath,
      connector: this._connector
    })

    await this._agent.startup()
  }

  async shutdown() {
    await this._localServer.close()
    this._attemptSocketRemove()
    return this._agent.shutdown()
  }
}
