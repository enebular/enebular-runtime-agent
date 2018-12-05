/* @flow */
import MbedConnector from './mbed-connector'

const mbedConnector = new MbedConnector()

async function startup() {
  return mbedConnector.startup()
}

async function shutdown() {
  return mbedConnector.shutdown()
}

async function exit() {
  await shutdown()
  process.exit(0)
}

if (require.main === module) {
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

  startup().then(ret => {
    if (!ret) {
      process.exit(1)
    }
  })
}

export { startup, shutdown }
