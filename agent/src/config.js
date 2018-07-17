/* @flow */
import p from 'path'

export default class Config {
  _config: Object
  _exposeVariablesName: Array<string> = [
    'DEBUG',
    'ENEBULAR_CONFIG_PATH',
    'NODE_RED_DIR',
    'NODE_RED_DATA_DIR',
    'NODE_RED_COMMAND'
  ]

  constructor() {
    // this is based on the source code structrue: ports/xxxxx/bin/enebular-xxx-agent
    const binPath = process.argv[1]
    const defaultBasePath = p.resolve(binPath, '../../')
    const pathComponents = binPath.split('/')
    const program = pathComponents[pathComponents.length - 1]

    this._config = {
      ENEBULAR_AGENT_BIN_PATH: binPath,
      ENEBULAR_CONFIG_PATH: p.resolve(defaultBasePath, '.enebular-agent.json'),
      ENEBULAR_AGENT_PID_FILE: p.resolve(
        defaultBasePath,
        '.enebular-agent.pid'
      ),
      NODE_RED_DIR: p.resolve(defaultBasePath, '../../node-red'),
      NODE_RED_DATA_DIR: p.resolve(
        defaultBasePath,
        '../../node-red/',
        '.node-red-config'
      ),
      NODE_RED_KILL_SIGNAL: 'SIGINT',
      MONITOR_INTERVAL_FAST: 30,
      MONITOR_INTERVAL_NORMAL: 60 * 5,
      /* the +1 is to allow the last fast interval to trigger first */
      MONITOR_INTERVAL_FAST_PERIOD: 60 * 3 + 1,
      ENEBULAR_AGENT_PROGRAM: program,
      ENABLE_SYSLOG: false
    }
  }

  get(key: string) {
    return this._config[key]
  }

  getExposedVariables(): Object {
    const myself = this
    const variables = {}
    this._exposeVariablesName.forEach(function(key) {
      if (myself._config[key]) {
        variables[key] = myself._config[key]
      }
    })
    return variables
  }

  addVariable(name: string, value: string, expose: boolean) {
    this._config[name] = value
    if (expose) {
      this._exposeVariablesName.push(name)
    }
  }

  importVariables(variables: Object) {
    const myself = this
    const items = Object.keys(variables)
    items.forEach(function(key) {
      if (variables[key]) {
        myself._config[key] = variables[key]
      }
    })
  }

  importEnvironmentVariables() {
    this.importVariables(process.env)
  }
}
