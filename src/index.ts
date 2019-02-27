import AgentUpdater from './agent-updater'
import System from './system'

function main(): Promise<boolean> {
  const updater = new AgentUpdater(new System())
  return updater.update().catch((err: Error) => {
    throw new Error(
      `\x1b[31mERROR\x1b[0m: Update failed , reason: ${
        err.message
      }\n    See details in full update log file:${updater.getLogFilePath()}`
    )
  })
}

if (require.main === module) {
  main().catch(err => {
    console.log(err)
    process.exit(1)
  })
}

export { main }
