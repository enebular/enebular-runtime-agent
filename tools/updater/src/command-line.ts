import { Command } from 'commander'
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
  private _commander: Command = new Command(pkg.name)

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
    this.addConfigOption('ENEBULAR_AGENT_USER', '--user <user>')
    this.addConfigOption('FORCE_UPDATE', '--force')
    this.addConfigOption(
      'REMOTE_MAINTENANCE_USER_PASSWORD',
      '--remote-maintenance-user-password <password>'
    )

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
    this._commander
      .command('update')
      .description('update enebular-agent')
      .action(() => {
        // 何もしない(_commanderにupdateコマンドを登録することが目的)
      })
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
        if (
          this._config.getBoolean('ROOT_REQUIRED') &&
          process.getuid?.() !== 0
        ) {
          throw new Error('You have to run this with root permission.')
        }

        if (!this._installPath || !this._installPort) {
          return false
        }
        try {
          const packageType = await installer.download(
            this._installPath,
            userInfo
          )
          const agentInfo = AgentInfo.createFromSource(
            system,
            this._installPath
          )
          if (packageType !== 'binary') {
            await installer.build(this._installPort, agentInfo, userInfo)
          }
          await installer.installRuntimeDependencies(
            this._installPort,
            agentInfo,
            userInfo
          )

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

  public addConfigOption(configName: string, option: string): void {
    this._commander.option(option, this._config.getDescription(configName))
    this._configOptionMap[configName] = this._commander.options
      .slice(-1)[0]
      .attributeName()
  }

  public getConfigOptions(): ConfigAnyTypes {
    const options: ConfigAnyTypes = {}
    const commanderOptions = this._commander.opts()
    Object.keys(this._configOptionMap).forEach((configName): void => {
      const optionName = this._configOptionMap[configName]
      if (commanderOptions[optionName]) {
        options[configName] = commanderOptions[optionName]
      }
    })
    return options
  }

  public parse(): void {
    this._commander.parse(process.argv)
  }
}
