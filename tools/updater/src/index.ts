import AgentUpdater from './agent-updater'

let updater: AgentUpdater

function printLogInfo(): void {
  updater.printLogInfo()
}

function run(): Promise<boolean | void> {
  updater = new AgentUpdater()
  return updater.run().catch((err: Error): void => {
    throw new Error(`ERROR: Update failed, reason: ${err.message}`)
  })
}

async function cancel(): Promise<void> {
  try {
    await updater.cancel()
  } catch (err) {
    // ignore
  }
}

async function exit(code: number): Promise<void> {
  await cancel()
  process.exit(code)
}

if (require.main === module) {
  process.on('SIGINT', (): void => {
    exit(1)
  })
  process.on('SIGTERM', (): void => {
    exit(1)
  })

  run()
    .then((success): void => {
      printLogInfo()
      process.exit(success ? 0 : 1)
    })
    .catch((err): void => {
      console.error(err)
      printLogInfo()
      process.exit(1)
    })
}

export { run, cancel, printLogInfo }
