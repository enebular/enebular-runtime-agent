import * as program from 'commander'
import pkg from '../package.json'
import Config, { ConfigAnyTypes } from './config'

interface ConfigOptionMap {
  [configName: string]: string
}

export default class CommandLine {
  private _config: Config
  private _configOptionMap: ConfigOptionMap = {}
  private _commander: program.Command = new program.Command(pkg.name)

  public constructor(config: Config) {
    this._config = config
    this._commander.version(pkg.version, '-v, --version')

    this.addConfigOption('ENEBULAR_AGENT_INSTALL_DIR', '--install-dir <path>')
    this.addConfigOption(
      'ENEBULAR_AGENT_DOWNLOAD_URL',
      '--agent-download-url <url>'
    )
    this.addConfigOption('ENEBULAR_AGENT_USER', '--user <user>')
    this.addConfigOption('ENEBULAR_AGENT_UPDATER_ENABLE_LOG', '--enable-log')
    this.addConfigOption('DEBUG', '--debug-level <level>')
  }

  public addConfigOption(
    configName: string,
    option: string,
    coercion?: ((arg1: any, arg2: any) => void) | RegExp
  ): void {
    this._commander.option(
      option,
      this._config.getDescription(configName),
      coercion
    )
    this._configOptionMap[configName] = this._commander.options
      .slice(-1)[0]
      .attributeName()
  }

  public getConfigOptions(): ConfigAnyTypes {
    let options: ConfigAnyTypes = {}
    Object.keys(this._configOptionMap).forEach(configName => {
      const optionName = this._configOptionMap[configName]
      if (this._commander[optionName]) {
        options[configName] = this._commander[optionName]
      }
    })
    return options
  }

  public parse(): void {
    this._commander.parse(process.argv)
  }
}
