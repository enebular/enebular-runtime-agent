import * as path from 'path'
import { Utils } from './utils'

export interface ConfigItem {
  value: string | number | boolean
  description: string
  override?: boolean
  userExpose: boolean
}

export interface ConfigItems {
  [key: string]: ConfigItem
}

export interface ConfigStrings {
  [key: string]: string | undefined
}

export interface ConfigAnyTypes {
  [key: string]: string | number | boolean
}

export default class Config {
  private _items: ConfigItems

  public constructor() {
    this._items = {
      SUPPORTED_NODEJS_VERSION: {
        value: 'v12.22.5',
        description: 'Supported NodeJS version',
        userExpose: true
      },
      ENEBULAR_AGENT_INSTALL_DIR: {
        value: '/home/enebular/enebular-runtime-agent',
        description: 'install location of enebular-agent',
        userExpose: true
      },
      ENEBULAR_AGENT_VERSION: {
        value: 'latest',
        description: "the version to upgrade, default to 'latest'",
        userExpose: true
      },
      ENEBULAR_AGENT_DOWNLOAD_PATH: {
        value:
          'https://s3-ap-northeast-1.amazonaws.com/download.enebular.com/enebular-agent',
        description: 'the URL PATH to download enebular-agent',
        userExpose: true
      },
      ENEBULAR_AGENT_TEST_DOWNLOAD_PATH: {
        value:
          'https://s3-ap-northeast-1.amazonaws.com/download.enebular.com/enebular-agent-staging',
        description: 'the URL PATH to download test enebular-agent',
        userExpose: true
      },
      ENEBULAR_AGENT_USER: {
        value: 'enebular',
        description: 'user to run as after being installed',
        userExpose: true
      },
      ENEBULAR_AGENT_UPDATER_CACHE_DIR: {
        value: '/tmp/enebular-agent-updater-cache',
        description: 'location to store temporary update data',
        userExpose: true
      },
      MINIMUM_CHECKING_TIME: {
        value: 30,
        description: 'minimum wait seconds that agent has to stablely running',
        userExpose: false
      },
      ENEBULAR_AGENT_UPDATER_ENABLE_LOG: {
        value: true,
        description: 'enable console log',
        userExpose: true
      },
      MIGRATION_FILE_PATH: {
        value: path.resolve(__dirname, './migrations'),
        description: 'path to find migrations files',
        userExpose: true
      },
      PELION_MODE: {
        value: 'factory',
        description: 'pelion mode (developer or factory)',
        userExpose: true
      },
      FORCE_UPDATE: {
        value: false,
        description: 'force update to latest version',
        userExpose: true
      },
      DEBUG: {
        value: 'info',
        description: 'debug level, used to control logging',
        userExpose: true
      },
      ROOT_REQUIRED: {
        value: true,
        description: 'updater has to be run by privileged user or not',
        userExpose: false
      },
      NODE_JS_DOWNLOAD_BASE_URL: {
        value: 'https://nodejs.org/dist',
        description: 'NodeJS download base URL',
        userExpose: true
      },
      ENEBULAR_AGENT_UPDATER_LOG_FILE: {
        value: `/tmp/enebular-agent-updater-${Utils.randomString()}.log`,
        description: 'updater log file path',
        userExpose: false
      },
      REMOTE_MAINTENANCE_USER_NAME: {
        value: 'enebular-remote-admin',
        description: 'username to be set when creating remote maintenance user',
        userExpose: false
      },
      REMOTE_MAINTENANCE_USER_PASSWORD: {
        value: 'enebular',
        description: 'password to be set when creating remote maintenance user',
        userExpose: false
      }
    }
  }

  public createItem(
    key: string,
    value: string | number | boolean,
    description: string,
    userExpose: boolean
  ): boolean {
    if (key in this._items) return false

    this._items[key] = {
      value: value,
      description: description,
      userExpose: userExpose
    }
    return true
  }

  public getAllItems(): ConfigItems {
    return this._items
  }

  public getItem(key: string): ConfigItem {
    if (this._items[key] == undefined) {
      throw new Error(`Cannot found config ${key}`)
    }
    return this._items[key]
  }

  public getString(key: string): string {
    if (
      this._items[key] == undefined ||
      typeof this._items[key].value !== 'string'
    ) {
      throw new Error(`Cannot found config ${key}`)
    }
    return this._items[key].value as string
  }

  public getNumber(key: string): number {
    if (this._items[key] && typeof this._items[key].value !== 'number') {
      throw new Error(`Cannot found config ${key}`)
    }
    return this._items[key].value as number
  }

  public getBoolean(key: string): boolean {
    if (
      this._items[key] == undefined ||
      typeof this._items[key].value !== 'boolean'
    ) {
      throw new Error(`Cannot found config ${key}`)
    }
    return this._items[key].value as boolean
  }

  public getDescription(key: string): string {
    return this.getItem(key).description
  }

  public getOverriddenItems(): ConfigItems {
    const ret: ConfigItems = {}
    Object.entries(this._items).map((entry): void => {
      const key = entry[0]
      if (entry[1].override) {
        ret[key] = this._items[key]
      }
    })
    return ret
  }

  public isOverridden(key: string): boolean {
    return this.getItem(key).override ? true : false
  }

  public set(key: string, value: string | number | boolean): boolean {
    if (typeof this._items[key].value !== typeof value) {
      return false
    }
    this._items[key].override = true
    this._items[key].value = value
    return true
  }

  public setAutoDetectType(key: string, value?: string): boolean {
    if (!(key in this._items) || !value) return false

    let int
    if (value == 'true' || value == 'false') {
      return this.set(key, value == 'true')
    } else if (!isNaN((int = parseInt(value)))) {
      return this.set(key, int)
    } else {
      return this.set(key, value)
    }
  }

  public importConfigStrings(items: ConfigStrings): void {
    Object.keys(items).forEach((key): void => {
      // modify only, we don't create new config item.
      if (key in this._items) {
        this.setAutoDetectType(key, items[key])
      }
    })
  }

  public importConfigAnyTypes(items: ConfigAnyTypes): void {
    Object.keys(items).forEach((key): void => {
      // modify only, we don't create new config item.
      if (key in this._items) {
        this.set(key, items[key])
      }
    })
  }
}
