/* @flow */
import path from 'path'
import { LocalPort } from 'enebular-runtime-agent'

const mbedPort = new LocalPort()

async function startup() {
  await mbedPort.startup(path.resolve(__dirname, '../'))
}

async function shutdown() {
  await mbedPort.shutdown()
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
