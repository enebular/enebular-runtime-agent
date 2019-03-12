import MockSystem from '../mock/system'
import MockAgentInstaller from '../mock/agent-installer'
import MockMigrator from '../mock/migrator'

export default class Mockhelper {
  public static createDefaultMocks(): {
    system: MockSystem
    installer: MockAgentInstaller
    migrator: MockMigrator
  } {
    const cache = process.env.ENEBULAR_AGENT_UPDATER_CACHE_DIR ? process.env.ENEBULAR_AGENT_UPDATER_CACHE_DIR : '/tmp'
    const system = new MockSystem(cache)
    return {
      system,
      installer: new MockAgentInstaller(system),
      migrator: new MockMigrator()
    }
  }
}
