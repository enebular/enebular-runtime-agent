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
        value: 'v9.2.1',
        description: 'Supported NodeJS version',
        userExpose: true
      },
      ENEBULAR_AGENT_INSTALL_DIR: {
        value: '/home/enebular/enebular-runtime-agent',
        description: 'Install location of enebular-agent',
        userExpose: true
      },
      ENEBULAR_AGENT_DOWNLOAD_URL: {
        value:
          'https://s3-ap-southeast-2.amazonaws.com/enebular-agent-update-youxin-test/2.4.0-rc1-prebuilt.tar.gz',
        description: 'The URL where to download enebular-agent',
        userExpose: true
      },
      ENEBULAR_AGENT_USER: {
        value: 'enebular',
        description: 'Install location of enebular-agent',
        userExpose: true
      },
      ENEBULAR_AGENT_UPDATER_ENABLE_LOG: {
        value: true,
        description: 'Install location of enebular-agent',
        userExpose: true
      },
      DEBUG: {
        value: 'info',
        description: 'Debug level, used to control logging',
        userExpose: true
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
    let ret: ConfigItems = {}
    Object.entries(this._items).map(entry => {
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
      /* console.log( */
      /* `${key} type mismatch, expected: ${typeof this._items[key] */
      /* .value}, but got ${typeof value}` */
      /* ) */
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
    Object.keys(items).forEach(key => {
      // modify only, we don't create new config item.
      if (key in this._items) {
        this.setAutoDetectType(key, items[key])
      }
    })
  }

  public importConfigAnyTypes(items: ConfigAnyTypes): void {
    Object.keys(items).forEach(key => {
      // modify only, we don't create new config item.
      if (key in this._items) {
        this.set(key, items[key])
      }
    })
  }
}
