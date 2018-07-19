/* @flow */
import p from 'path'

export default class Config {
  _items: Object
  _exposedItemNames: Array<string> = [
    'DEBUG',
    'ENEBULAR_CONFIG_PATH',
    'NODE_RED_DIR',
    'NODE_RED_DATA_DIR',
    'NODE_RED_COMMAND'
  ]

  constructor(portBasePath: string) {
    this._items = {
      ENEBULAR_DAEMON_MODE: false,
      ENEBULAR_CONFIG_PATH: p.resolve(portBasePath, '.enebular-config.json'),
      ENEBULAR_AGENT_PID_FILE: p.resolve(portBasePath, '.enebular-agent.pid'),
      NODE_RED_DIR: p.resolve(portBasePath, '../../node-red'),
      NODE_RED_DATA_DIR: p.resolve(
        portBasePath,
        '../../node-red/',
        '.node-red-config'
      ),
      NODE_RED_KILL_SIGNAL: 'SIGINT',
      ENEBULAR_MONITOR_INTERVAL_FAST: 30,
      ENEBULAR_MONITOR_INTERVAL_NORMAL: 60 * 5,
      /* the +1 is to allow the last fast interval to trigger first */
      ENEBULAR_MONITOR_INTERVAL_FAST_PERIOD: 60 * 3 + 1,

      // logging
      ENEBULAR_LOG_LEVEL: 'info',
      ENEBULAR_ENABLE_CONSOLE_LOG: false,
      ENEBULAR_ENABLE_FILE_LOG: false,
      ENEBULAR_ENABLE_SYSLOG: false,
      ENEBULAR_LOG_FILE_PATH: '/var/log/enebular/enebular.log',
      ENEBULAR_ENABLE_ENEBULAR_LOG: true,
      ENEBULAR_ENEBULAR_LOG_CACHE_PATH: '/tmp/enebular-log-cache',
      ENEBULAR_ENEBULAR_LOG_MAX_CACHE_SIZE: 2 * 1024 * 1024,
      ENEBULAR_ENEBULAR_LOG_MAX_SIZE_PER_INTERVAL: 10 * 1024,
      ENEBULAR_ENEBULAR_LOG_SEND_INTERVAL: 30
    }
  }

  get(key: string) {
    return this._items[key]
  }

  set(key: string, value: string) {
    if (value) {
      this._items[key] = value
    }
  }

  getExposedItems(): Object {
    const myself = this
    const items = {}
    this._exposedItemNames.forEach(key => {
      if (myself._items[key]) {
        items[key] = myself._items[key]
      }
    })
    return items
  }

  addItem(name: string, value: string, expose: boolean) {
    this._items[name] = value
    if (expose) {
      this._exposedItemNames.push(name)
    }
  }

  importItems(items: Object) {
    const myself = this
    const itemKeys = Object.keys(items)
    itemKeys.forEach(key => {
      if (items[key]) {
        myself._items[key] = items[key]
      }
    })
  }

  importEnvironmentVariables() {
    this.importItems(process.env)
  }
}
