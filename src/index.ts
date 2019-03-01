import AgentUpdater from './agent-updater'

let updater: AgentUpdater

function update(): Promise<boolean> {
  updater = new AgentUpdater()
  return updater.update().catch((err: Error) => {
    throw new Error(
      `\x1b[31mERROR\x1b[0m: Update failed, reason: ${
        err.message
      }\n    See details in full update log file:${updater.getLogFilePath()}`
    )
  })
}

async function cancel(): Promise<boolean> {
  try {
    await updater.cancel()
  } catch (err) {
    // ignore
  }
  return true
}

async function exit() {
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
      process.exit(success ? 0 : 1)
    })
    .catch(err => {
      console.error(err)
      process.exit(1)
    })
}

export { update, cancel }
