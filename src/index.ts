import AgentUpdater from './agent-updater'

function main(): Promise<string> {
  const updater = new AgentUpdater()
  return updater.update().catch((err: Error) => {
    throw new Error('failed to update reason: ' + err.message)
  })
}

if (require.main === module) {
  main().catch((err) => {
    console.log(err)
    process.exit(1)
  })
}

export { main }
