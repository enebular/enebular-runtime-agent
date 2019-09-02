import * as program from 'commander'
import pkg from '../package.json'
import Config, { ConfigAnyTypes } from './config'

interface ConfigOptionMap {
  [configName: string]: string
}

export default class CommandLine {
  private _command?: string
  private _commandOptions = {}
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
      'ENEBULAR_AGENT_TEST_DOWNLOAD_PATH',
      '--agent-test-download-path <url>'
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

    this._commander.on('command:*', () => {
      if (!process.env.ENEBULAR_TEST && this._commander.args.length > 0) {
        this._command = 'unknown'
      }
    })

    this._commander
      .command('install')
      .description('install enebular-agent')
      .action(options => {
        this._command = 'install'
        this._commandOptions = options
      })
  }

  public hasCommand(): boolean {
    return !!this._command
  }

  public processCommand(): boolean{
    switch (this._command) {
      case 'install':
        return true
      case 'unknown':
      default:
        console.error(
          'Invalid command: %s\nSee --help for a list of available commands.',
          this._commander.args.join(' ')
        )
        return false
    }
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
