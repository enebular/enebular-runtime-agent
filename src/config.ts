export interface ConfigItem {
  value?: string | number | boolean
  description?: string
  override?: boolean
  userExpose?: boolean
}

export interface ConfigItems {
  [key: string]: ConfigItem
}

interface NodeEnv {
  [key: string]: string | undefined
}

export default class Config {
  private _items: ConfigItems

  public constructor() {
    this._items = {
      ENEBULAR_AGENT_INSTALL_DIR: {
        value: '/home/enebular/enebular-runtime-agent',
        description: 'Install location of enebular-agent',
        userExpose: true
      },
      ENEBULAR_AGENT_USER: {
        value: 'enebular',
        description: 'Install location of enebular-agent',
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

    this._items[key] = {}
    this._items[key].value = value
    this._items[key].description = description
    this._items[key].userExpose = userExpose
    return true
  }

  public getAllItems(): ConfigItems {
    return this._items
  }

  public getItem(key: string): ConfigItem | undefined {
    return this._items[key]
  }

  public getString(key: string): string | undefined {
    if (
      this._items[key] == undefined ||
      typeof this._items[key].value !== 'string'
    )
      return undefined
    return this._items[key].value as string
  }

  public getNumber(key: string): number | undefined {
    if (this._items[key] && typeof this._items[key].value !== 'number')
      return undefined
    return this._items[key].value as number
  }

  public getBoolean(key: string): boolean | undefined {
    if (
      this._items[key] == undefined ||
      typeof this._items[key].value !== 'boolean'
    )
      return undefined
    return this._items[key].value as boolean
  }

  public getDescription(key: string): string | undefined {
    const item = this.getItem(key)
    return item ? item.description : undefined
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

  public set(key: string, value: string | number | boolean): boolean {
    if (typeof this._items[key].value !== typeof value) {
      return false
    }
    this._items[key].override = true
    this._items[key].value = value
    return true
  }

  public setAutoDetectType(key: string, value: string | undefined): boolean {
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

  public importEnvironmentVariables(items: NodeEnv): void {
    Object.keys(items).forEach(key => {
      // modify only, we don't create new config item.
      if (key in this._items) {
        this.setAutoDetectType(key, items[key])
      }
    })
  }
}
