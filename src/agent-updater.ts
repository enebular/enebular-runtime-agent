import Config from './config'
import CommandLine from './command-line'
import * as fs from 'fs'

export default class AgentUpdater {
  private _config: Config
  private _commandLine: CommandLine

  public constructor() {
    this._config = new Config()
    this._config.importConfigStrings(process.env)

    this._commandLine = new CommandLine(this._config)
    this._commandLine.parse()
    this._config.importConfigAnyTypes(this._commandLine.getConfigOptions())
  }

  public async update(): Promise<string> {
    console.log(
      'enebular-agent install directory is: ' +
        this._config.getString('ENEBULAR_AGENT_INSTALL_DIR')
    )

    return 'sds'
  }
}
