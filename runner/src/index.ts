import AgentRunner from './agent-runner'

let runner: AgentRunner

function run(): Promise<boolean | void> {
  runner = new AgentRunner()
  return runner.run()
}

async function cancel(): Promise<void> {
  try {
    await runner.cancel()
  } catch (err) {
    // ignore
  }
}

async function exit(): Promise<void> {
  await cancel()
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

  run()
    .then(
      (success): void => {
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

export { run, cancel }
