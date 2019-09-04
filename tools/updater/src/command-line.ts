import * as program from 'commander'
import pkg from '../package.json'
import AgentInfo from './agent-info'
import Config, { ConfigAnyTypes } from './config'
import { AgentInstallerIf } from './agent-installer'
import { SystemIf } from './system'
import { UserInfo } from './utils'

interface ConfigOptionMap {
  [configName: string]: string
}

export default class CommandLine {
  private _command?: string
  private _installPath?: string
  private _installPort?: string
  private _commandOptions: ConfigOptionMap = {}
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
      .command('install <port> <path>')
      .description('install enebular-agent <port> <path>')
      .action((port, path, options) => {
        this._command = 'install'
        this._installPort = port
        this._installPath = path
        this._commandOptions = options
      })
      .option(
        '--dev-creds-path <path>',
        'Path to mbed cloud dev credentials (must be specified in developer mode)'
      )
      .option(
        '--bundle-file-path <path>',
        'Path to mbed cloud bundle file (must be specified in factory mode)'
      )
  }

  public hasCommand(): boolean {
    return !!this._command
  }

  public async processCommand(
    installer: AgentInstallerIf,
    system: SystemIf,
    userInfo: UserInfo
  ): Promise<boolean> {
    switch (this._command) {
      case 'install':
        const pelionMode = this._config.getString('PELION_MODE')
        if (!this._installPath || !this._installPort) {
          return false
        }
        try {
          if (this._installPort === 'pelion') {
            if (!this._config.isOverridden('PELION_MODE')) {
              throw new Error(
                `Installing enebular-agent pelion port requires --pelion-mode to be set (developer or factory)`
              )
            }
            if (pelionMode !== 'developer' && pelionMode !== 'factory') {
              throw new Error(
                `--pelion-mode must be either developer or factory`
              )
            }
            if (pelionMode === 'developer' && !this._commandOptions.devCredsPath) {
              throw new Error(
                `--dev-creds-path must be specified in pelion developer mode`
              )
            }
            if (pelionMode === 'factory' && !this._commandOptions.bundleFilePath) {
              throw new Error(
                `--bundle-file-path must be specified in pelion factory mode`
              )
            }
          }
 
          await installer.download(this._installPath, userInfo)
          await installer.build(
            this._installPort,
            AgentInfo.createFromSource(
              system,
              this._installPath
            ),
            userInfo,
            this._commandOptions.devCredsPath
          )
          if (pelionMode === 'factory') {
            await installer.bundle2PAL(
              this._installPath,
              this._commandOptions.bundleFilePath,
              userInfo
            )
          }
          return true
        } catch (err) {
          console.error(`Install enebular-agent failed, reason: ${err.message}`)
          return false
        }
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
    const options: ConfigAnyTypes = {}
    Object.keys(this._configOptionMap).forEach((configName): void => {
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
