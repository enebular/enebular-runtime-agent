/* @flow */
import path from 'path'
import PelionConnector from './pelion-connector'
import {
  startup as runnerStartup,
  shutdown as runnerShutdown
} from '../../../agent/lib/runner/index'

const pelionConnector = new PelionConnector()

function startCore(): boolean {
  const startCore = process.argv.filter(arg => arg === '--start-core')
  return startCore.length > 0 ? true : false
}

async function startup() {
  const portBasePath = path.resolve(__dirname, '../')
  if (!startCore()) {
    return runnerStartup(portBasePath)
  }

  return pelionConnector.startup()
}

async function shutdown() {
  if (!startCore()) {
    return runnerShutdown()
  }
  return pelionConnector.shutdown()
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

  startup()
    .then(ret => {
      if (!ret) {
        process.exit(1)
      }
    })
    .catch(err => {
      console.error(`Agent startup failed: ${err}`)
      process.exit(1)
    })
}

export { startup, shutdown }
