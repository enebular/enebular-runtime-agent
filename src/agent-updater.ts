import Config from './config'

export default class AgentUpdater {
  private _config: Config

  public constructor() {
    this._config = new Config()
    this._config.importEnvironmentVariables(process.env)
  }

  public async update(): Promise<string> {
    console.log("enebular-agent install directory is: " + this._config.getString('ENEBULAR_AGENT_INSTALL_DIR'))

    return 'sds'
  }
}
