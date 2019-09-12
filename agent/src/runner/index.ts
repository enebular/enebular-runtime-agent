import AgentRunner from './agent-runner'

let runner: AgentRunner

function startup(portBasePath: string): Promise<boolean> {
  runner = new AgentRunner(portBasePath)
  return runner.startup()
}

async function shutdown(): Promise<void> {
  try {
    await runner.shutdown()
  } catch (err) {
    // ignore
  }
}

export { startup, shutdown }
