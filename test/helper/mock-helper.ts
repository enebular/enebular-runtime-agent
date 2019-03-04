import MockSystem from '../mock/system'
import MockAgentInstaller from '../mock/agent-installer'
import MockMigrator from '../mock/migrator'

export default class Mockhelper {
  public static createDefaultMocks(): {
    system: MockSystem,
    installer: MockAgentInstaller,
    migrator: MockMigrator,
  }{
    return {
      system: new MockSystem(),
      installer: new MockAgentInstaller(),
      migrator: new MockMigrator()
    }
  }
}


