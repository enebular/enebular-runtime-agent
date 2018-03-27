/* @flow */
import net from 'net'
import fs from 'fs'
import path from 'path'
import { EnebularAgent, MessengerService } from 'enebular-runtime-agent'

const MODULE_NAME = 'local'
const END_OF_MSG_MARKER = 0x1e // RS (Record Separator)
const SOCKET_PATH =
  process.env.SOCKET_PATH || '/tmp/enebular-local-agent.socket'

let agent: EnebularAgent
let localServer: net.Server

function log(level: string, msg: string, ...args: Array<mixed>) {
  args.push({ module: MODULE_NAME })
  agent.log.log(level, msg, ...args)
}

function debug(msg: string, ...args: Array<mixed>) {
  log('debug', msg, ...args)
}

function info(msg: string, ...args: Array<mixed>) {
  log('info', msg, ...args)
}

function error(msg: string, ...args: Array<mixed>) {
  log('error', msg, ...args)
}

function attemptSocketRemove() {
  try {
    fs.unlinkSync(SOCKET_PATH)
  } catch (err) {
    // ignore any errors
  }
}

async function startLocalServer(messenger: MessengerService): net.Server {
  function handleClientMessage(clientMessage: string) {
    debug(`client message: [${clientMessage}]`)
    let message
    try {
      message = JSON.parse(clientMessage)
      switch (message.type) {
        case 'connect':
          messenger.updateConnectedState(true)
          break
        case 'disconnect':
          messenger.updateConnectedState(false)
          break
        case 'message':
          messenger.sendMessage(
            message.message.messageType,
            message.message.message
          )
          break
        case 'log':
          log(message.log.level, message.log.message)
          break
        default:
          info('unsupported client message type: ' + message.type)
          break
      }
    } catch (err) {
      error('client message: failed to handle: ' + err)
    }
  }

  const server = net.createServer(socket => {
    info('client connected')

    socket.setEncoding('utf8')

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
        info('client ended with partial message: ' + messages)
        messages = ''
      }
    })

    socket.on('close', () => {
      info('client disconnected')
      messenger.updateConnectedState(false)
    })

    socket.on('error', err => {
      info('client socket error: ' + err)
    })

    socket.write('ok' + String.fromCharCode(END_OF_MSG_MARKER))
  })

  server.on('listening', () => {
    info('server listening on: ' + JSON.stringify(server.address()))
  })

  server.on('error', err => {
    error('server error: ' + err)
  })

  server.on('close', () => {
    info('server closed')
  })

  attemptSocketRemove()
  server.listen(SOCKET_PATH)

  return server
}

async function startup() {
  const messenger = new MessengerService()

  agent = new EnebularAgent(messenger, {
    nodeRedDir:
      process.env.NODE_RED_DIR || path.join(process.cwd(), 'node-red'),
    configFile: path.join(process.cwd(), '.enebular-config.json')
  })

  await agent.startup()
  info('agent started')

  localServer = await startLocalServer(messenger)
}

async function shutdown() {
  await localServer.close()
  attemptSocketRemove()
  return agent.shutdown()
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
