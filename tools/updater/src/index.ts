import AgentUpdater from './agent-updater'

let updater: AgentUpdater

function printLogInfo(): void {
  console.log(
    `See details in full update log file: ${updater.getLogFilePath()}`
  )
}

function update(): Promise<boolean> {
  updater = new AgentUpdater()
  return updater.update().catch((err: Error) => {
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

async function exit(): Promise<void> {
  await cancel()
  process.exit(0)
}

if (require.main === module) {
  process.on('SIGINT', () => {
    exit()
  })
  process.on('SIGTERM', () => {
    exit()
  })

  update()
    .then(success => {
      printLogInfo()
      process.exit(success ? 0 : 1)
    })
    .catch(err => {
      console.error(err)
      printLogInfo()
      process.exit(1)
    })
}

export { update, cancel, printLogInfo }
