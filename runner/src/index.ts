import AgentRunner from './agent-runner'

let runner: AgentRunner

function startup(): Promise<boolean | void> {
  runner = new AgentRunner()
  return runner.startup().catch(
    (err: Error): void => {
      throw new Error(`ERROR: Failed to start enebular-agent, reason: ${err.message}`)
    }
  )
}

async function shutdown(): Promise<void> {
  try {
    await runner.shutdown()
  } catch (err) {
    // ignore
  }
}

async function exit(): Promise<void> {
  await shutdown()
  process.exit(0)
}

if (require.main === module) {
  process.on(
    'SIGINT',
    (): void => {
      exit()
    }
  )
  process.on(
    'SIGTERM',
    (): void => {
      exit()
    }
  )

  startup()
    .then(
      (success): void => {
        console.info(`success: ${success}`)
        process.exit(success ? 0 : 1)
      }
    )
    .catch(
      (err): void => {
        console.error(err)
        process.exit(1)
      }
    )
}

export { startup, shutdown }
