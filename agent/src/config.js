/* @flow */
import p from 'path'

export type ConfigItem = {
  value?: any,
  description: string,
  override?: boolean,
  userExpose?: boolean
}

export default class Config {
  _items: Object

  constructor(portBasePath: string) {
    this._items = {
      ENEBULAR_DEV_MODE: {
        value: false,
        description: 'Run in developer mode',
        userExpose: true
      },
      ENEBULAR_DAEMON_MODE: {
        value: false,
        description: 'Run as daemon',
        userExpose: true
      },
      ENEBULAR_START_CORE: {
        value: false,
        description: 'Run enebular-agent core',
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
      NODE_RED_AI_NODES_DIR: {
        value: p.resolve(
          portBasePath,
          '../../node-red/',
          '.node-red-config',
          'node-red-enebular-ai-nodes'
        ),
        description: 'Node-RED Ai Nodes path',
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
      ENEBULAR_MONITOR_STATE_PATH: {
        value: p.resolve(portBasePath, '.enebular-monitor.json'),
        description: 'Monitor state file path',
        userExpose: true
      },
      ENEBULAR_DEVICE_STATE_REFRESH_INTERVAL: {
        value: 60 * 60 * 12,
        description: 'Device state refresh interval',
        userExpose: true
      },
      ENEBULAR_ASSETS_DATA_PATH: {
        value: p.resolve(portBasePath, 'assets'),
        description: 'Assets data directory path',
        userExpose: true
      },
      ENEBULAR_AI_MODELS_DATA_PATH: {
        value: p.resolve(portBasePath, 'ai-models'),
        description: 'Ai Model data directory path',
        userExpose: true
      },
      ENEBULAR_ASSETS_STATE_PATH: {
        value: p.resolve(portBasePath, '.enebular-assets.json'),
        description: 'Assets state file path',
        userExpose: true
      },
      ENEBULAR_AI_MODELS_STATE_PATH: {
        value: p.resolve(portBasePath, '.enebular-ai-models.json'),
        description: 'Ai Models state file path',
        userExpose: true
      },
      ENEBULAR_FLOW_STATE_PATH: {
        value: p.resolve(portBasePath, '.enebular-flow.json'),
        description: 'Flow state file path',
        userExpose: true
      },
      ENEBULAR_CONNECTOR_MESSENGER_REQ_RETYR_TIMEOUT: {
        value: 30 * 1000,
        description: '',
        userExpose: false
      },
      ENEBULAR_NODE_RED_FLOW_START_TIMEOUT: {
        value: 30 * 1000,
        description: '',
        userExpose: false
      },

      // logging
      ENEBULAR_LOG_LEVEL: {
        value: 'info',
        description: 'Logging level',
        userExpose: true
      },
      ENEBULAR_LOG_METRICS_ENABLE: {
        value: false,
        description: 'Enable metrics logging',
        userExpose: true
      },
      ENEBULAR_LOG_METRICS_INTERVAL: {
        value: 30,
        description: 'Metrics logging interval (seconds)',
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

      if (
        typeof value === 'string' &&
        typeof this._items[key].value === 'boolean'
      ) {
        this._items[key].value = value == 'true'
      } else if (
        typeof value === 'string' &&
        typeof this._items[key].value === 'number'
      ) {
        this._items[key].value = parseInt(value)
      } else {
        this._items[key].value = value
      }
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
