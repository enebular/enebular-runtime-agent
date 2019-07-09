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
      'ENEBULAR_AGENT_VERSION',
      '--release-version <version>'
    )
    this.addConfigOption(
      'ENEBULAR_AGENT_DOWNLOAD_PATH',
      '--agent-download-path <url>'
    )
    this.addConfigOption(
      'ENEBULAR_AGENT_GITHUB_API_PATH',
      '--agent-github-api-path <url>'
    )
    this.addConfigOption('ENEBULAR_AGENT_USER', '--user <user>')
    this.addConfigOption(
      'PELION_MODE',
      '--pelion-mode <mode>',
      /^(factory|developer)$/i
    )
    this.addConfigOption('FORCE_UPDATE', '--force')
  }

  public addConfigOption(
    configName: string,
    option: string,
    coercion?: (() => void) | RegExp
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
    Object.keys(this._configOptionMap).forEach(
      (configName): void => {
        const optionName = this._configOptionMap[configName]
        if (this._commander[optionName]) {
          options[configName] = this._commander[optionName]
        }
      }
    )
    return options
  }

  public parse(): void {
    this._commander.parse(process.argv)
  }
}
