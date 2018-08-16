/* @flow */
import p from 'path'

export type ConfigItem = {
  value?: string,
  description: string,
  override?: boolean,
  userExpose?: boolean
}

export default class Config {
  _items: Object

  constructor(portBasePath: string) {
    this._items = {
      ENEBULAR_DAEMON_MODE: {
        value: false,
        description: 'Run as daemon',
        userExpose: true
      },
      ENEBULAR_CONFIG_PATH: {
        value: p.resolve(portBasePath, '.enebular-config.json'),
        description: 'Enebular config file path',
        userExpose: true
      },
      ENEBULAR_AGENT_PID_FILE: {
        value: p.resolve(portBasePath, '.enebular-agent.pid'),
        description: 'PID file path when running as daemon',
        userExpose: true
      },
      ENEBULAR_NODE_RED_PID_FILE: {
        value: p.resolve(portBasePath, '.node-red.pid'),
        description: 'Node-RED PID file path',
        userExpose: true
      },
      NODE_RED_DIR: {
        value: p.resolve(portBasePath, '../../node-red'),
        description: 'Node-RED installation path',
        userExpose: true
      },
      NODE_RED_DATA_DIR: {
        value: p.resolve(portBasePath, '../../node-red/', '.node-red-config'),
        description: 'Node-RED data path',
        userExpose: true
      },
      NODE_RED_COMMAND: {
        description: 'Node-RED startup command',
        userExpose: true
      },
      NODE_RED_KILL_SIGNAL: {
        value: 'SIGINT',
        description: 'Signal name to use to terminal Node-RED',
        userExpose: true
      },
      ACTIVATOR_CONFIG_PATH: {
        value: p.resolve(portBasePath, '.enebular-activation-config.json'),
        description: 'Activator config file path',
        userExpose: true
      },
      ENEBULAR_MONITOR_INTERVAL_FAST: {
        value: 30,
        description: '',
        userExpose: false
      },
      ENEBULAR_MONITOR_INTERVAL_NORMAL: {
        value: 60 * 5,
        description: '',
        userExpose: false
      },
      /* the +1 is to allow the last fast interval to trigger first */
      ENEBULAR_MONITOR_INTERVAL_FAST_PERIOD: {
        value: 60 * 3 + 1,
        description: '',
        userExpose: false
      },

      // logging
      ENEBULAR_LOG_LEVEL: {
        value: 'info',
        description: 'Logging level',
        userExpose: true
      },
      ENEBULAR_ENABLE_CONSOLE_LOG: {
        value: false,
        description: 'Enable logging to the console',
        userExpose: true
      },
      ENEBULAR_ENABLE_FILE_LOG: {
        value: false,
        description: 'Enable logging to a file',
        userExpose: true
      },
      ENEBULAR_ENABLE_SYSLOG: {
        value: false,
        description: 'Enable syslog logging',
        userExpose: true
      },
      ENEBULAR_LOG_FILE_PATH: {
        value: '/var/log/enebular/enebular.log',
        description: 'Log file path',
        userExpose: true
      },
      ENEBULAR_ENABLE_ENEBULAR_LOG: {
        value: true,
        description: 'Enable logging to enebular',
        userExpose: true
      },
      ENEBULAR_ENEBULAR_LOG_CACHE_PATH: {
        value: '/tmp/enebular-log-cache',
        description: 'Cache path for enebular logging',
        userExpose: true
      },
      ENEBULAR_ENEBULAR_LOG_MAX_CACHE_SIZE: {
        value: 2 * 1024 * 1024,
        description: 'Maximum cache size for enebular logging',
        userExpose: true
      },
      ENEBULAR_ENEBULAR_LOG_MAX_SIZE_PER_INTERVAL: {
        value: 10 * 1024,
        description: '',
        userExpose: false
      },
      ENEBULAR_ENEBULAR_LOG_SEND_INTERVAL: {
        value: 30,
        description: '',
        userExpose: false
      }
    }
  }

  get items(): Object {
    return this._items
  }

  getDescription(key: string): string {
    return this._items[key] ? this._items[key].description : undefined
  }

  get(key: string): any {
    return this._items[key] ? this._items[key].value : undefined
  }

  set(key: string, value: any) {
    if (value) {
      if (this._items[key]) {
        this._items[key].override = true
      } else {
        this._items[key] = {}
      }
      this._items[key].value = value
    }
  }

  getOverriddenItems(): Object {
    const myself = this
    const items = {}
    const itemKeys = Object.keys(this._items)
    itemKeys.forEach(key => {
      if (myself._items[key].override) {
        items[key] = myself._items[key].value
      }
    })
    return items
  }

  addItem(key: string, value: any, description: string, userExpose: boolean) {
    this.set(key, value)
    this._items[key].description = description
    this._items[key].userExpose = userExpose
  }

  importItems(items: Object) {
    const myself = this
    const itemKeys = Object.keys(items)
    itemKeys.forEach(key => {
      if (myself._items[key]) {
        myself.set(key, items[key])
      }
    })
  }

  importEnvironmentVariables() {
    this.importItems(process.env)
  }
}
