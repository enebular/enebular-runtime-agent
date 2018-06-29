/* @flow */
import p from 'path'

function getDefaultAgentHome() {
  let path: string

  if (process.env.ENEBULAR_AGENT_HOME) path = process.env.ENEBULAR_AGENT_HOME
  else if (process.env.HOME)
    path = p.resolve(process.env.HOME, '.enebular-agent')
  else {
    console.error('Environment variable HOME is not set!')
    console.error('Defaulting to /etc/.enebular-agent')
    path = p.resolve('/etc', '.enebular-agent')
  }

  // console.log('Enebular agent home resolved to', path);
  return path
}

function createAgentPaths(agentHome: string) {
  if (!agentHome) {
    agentHome = getDefaultAgentHome()
  }

  // this is based on the source code structrue: ports/xxxxx/bin/enebular-xxx-agent
  const binPath = process.argv[1]
  let agentFilePaths = {
    ENEBULAR_AGENT_BIN_PATH: binPath,
    ENEBULAR_AGENT_HOME: agentHome,
    ENEBULAR_CONFIG_PATH: p.resolve(agentHome, '.enebular-agent.json'),
    ENEBULAR_AGENT_PID_FILE: p.resolve(agentHome, '.enebular-agent.pid'),
    NODE_RED_DIR: p.resolve(binPath, '../../../../node-red'),
    NODE_RED_DATA_DIR: p.resolve(
      binPath,
      '../../../../node-red/',
      '.node-red-config'
    ),
    AWSIOT_CONFIG_FILE: p.resolve(binPath, '../../', 'config.json')
  }

  // allow overide of file paths via environnement
  let items = Object.keys(agentFilePaths)
  items.forEach(function(key) {
    if (process.env[key]) {
      agentFilePaths[key] = process.env[key]
    }
  })
  return agentFilePaths
}

function createConstants(agentFilePaths: Object) {
  // program name
  const pathComponents = agentFilePaths.ENEBULAR_AGENT_BIN_PATH.split('/')
  const program = pathComponents[pathComponents.length - 1]

  let constants = {
    NODE_RED_COMMAND:
      p.resolve(agentFilePaths.NODE_RED_DIR, './node_modules/.bin/node-red') +
      ' -s ' +
      p.resolve(agentFilePaths.NODE_RED_DATA_DIR, 'settings.js'),
    NODE_RED_KILL_SIGNAL: 'SIGINT',
    MONITOR_INTERVAL_FAST: 30,
    MONITOR_INTERVAL_NORMAL: 60 * 5,
    /* the +1 is to allow the last fast interval to trigger first */
    MONITOR_INTERVAL_FAST_PERIOD: 60 * 3 + 1,
    ENEBULAR_AGENT_PROGRAM: program
  }

  // allow overide of constants via environnement
  let items = Object.keys(constants)
  items.forEach(function(key) {
    if (process.env[key]) {
      constants[key] = process.env[key]
    }
  })
  return Object.assign(constants, agentFilePaths)
}

export default createConstants(
  createAgentPaths(process.env.OVERIDE_ENEBULAR_AGENT_HOME)
)
