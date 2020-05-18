import fs from 'fs'
import ProcessUtil, { type RetryInfo } from '../src/process-util'
import { execSync, type ChildProcess } from 'child_process'

import DummyAgent from './helpers/dummy-agent'
import NodeREDController from '../src/node-red-controller'

jest.unmock('winston')

const testAssetID = '01234567-89ab-cdef-0123-456789abcdef'
const testUpdateID = '01234567-89ab-cdef-0123-456789abcdef'

jest.setTimeout(50000) 

function sleep(waitms) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve()
    }, waitms)
  }) 
}

function clearFlowConfig() {
  if (fs.existsSync('./__tests__/.enebular-flow.json')) {
    fs.unlinkSync('./__tests__/.enebular-flow.json')
  }
  if (fs.existsSync('./__tests__/.node-red.pid')) {
    ProcessUtil.killProcessByPIDFile('./__tests__/.node-red.pid')
    fs.unlinkSync('./__tests__/.node-red.pid')
  }
  if (fs.existsSync('../node-red/.node-red-config/flows.json')) {
    fs.unlinkSync('../node-red/.node-red-config/flows.json')
  }
  if (fs.existsSync('../node-red/.node-red-config/flows_cred.json')) {
    fs.unlinkSync('../node-red/.node-red-config/flows_cred.json')
  }
}

describe('Flow Deploy Test', () => {
  let dummyAgent
  let config
  let deviceStateManager
  let logManager
  let log
  let connectorMessenger
  let deviceCommandManager
  let nodeRedController
  const sleepTimeProcNodeRed = 10000

  beforeAll(async () => {
    clearFlowConfig()
    execSync('npm --prefix ../node-red/ ci --production')
    /*
    , {
      stdio: 'inherit',
      cwd: '../node-red'
    })
    await sleep(sleepTimeProcNodeRed)
    */
  });

  beforeEach(async () => {
    dummyAgent = new DummyAgent(__dirname)
    deviceStateManager = dummyAgent.deviceStateManager()
    deviceCommandManager = dummyAgent.deviceCommandManager()
    config = dummyAgent.config()
    logManager = dummyAgent.logManager()
    log = dummyAgent.log()
    connectorMessenger = dummyAgent.connectorMessenger()

    nodeRedController = new NodeREDController(
      deviceStateManager,
      deviceCommandManager,
      connectorMessenger,
      config,
      log,
      logManager,
      {
        dir: config.get('NODE_RED_DIR'),
        dataDir: config.get('NODE_RED_DATA_DIR'),
        aiNodesDir: config.get('NODE_RED_AI_NODES_DIR'),
        command: config.get('NODE_RED_COMMAND') || './node_modules/.bin/node-red -s .node-red-config/settings.js',
        killSignal: config.get('NODE_RED_KILL_SIGNAL'),
        pidFile: config.get('ENEBULAR_NODE_RED_PID_FILE'),
        assetsDataPath: config.get('ENEBULAR_ASSETS_DATA_PATH'),
        allowEditSessions: config.get('ENEBULAR_DEV_MODE')
      }
    )

    await nodeRedController.setup()
    nodeRedController.activate(true)
    await nodeRedController.startService()

    deviceStateManager.__setState(
      'desired',
      null,
      {
        type: "desired",
        meta: {
          v: "1",
          ts: 1586240911650,
          uId: 1,
          pHash: "123456789abcdefghijelmnopqrs",
          hash: "123456789abcdefghijelmnopqrs",
        },
        state: {
          flow: {
            flow: {
            }
          }
        }
      }
    )
    deviceStateManager.__setState(
      'reported',
      null,
      {
        type: "reported",
        meta: null,
        state: {
          flow: {
            flow: {},
            enable: false
          }
        }
      }
    )
  });

  afterEach(() => {
    clearFlowConfig()
    jest.restoreAllMocks()
    dummyAgent = null
  });
  
  afterAll(() => {
  })

  test('Paramater Test - flow.flow deploy', async () => {
    const spy = jest.spyOn(deviceStateManager, 'updateState')
    jest.spyOn(connectorMessenger, 'sendRequest').mockImplementation(() => {
      return {url: "https://test"}
    })
    jest.spyOn(nodeRedController, '_downloadPackage').mockImplementation(async (downloadUrl) => {
      return {"flow":[{"id":"25ea00ae.e05d4f","type":"tab","label":"flow1","disabled":false,"info":""},{"id":"f6feaa6c.9fcaf8","type":"inject","z":"15ea00ae.e05d4f","name":"","topic":"","payload":"","payloadType":"date","repeat":"10","crontab":"","once":false,"onceDelay":0.1,"x":370,"y":260,"wires":[["3e3e973f.f730a8"]]},{"id":"9665d4eb.4bb958","type":"debug","z":"15ea00ae.e05d4f","name":"","active":true,"tosidebar":true,"console":true,"tostatus":false,"complete":"payload","x":760,"y":360,"wires":[]},{"id":"3e3e973f.f730a8","type":"change","z":"15ea00ae.e05d4f","name":"","rules":[{"t":"set","p":"payload","pt":"msg","to":"test_deploy","tot":"str"}],"action":"","property":"","from":"","to":"","reg":false,"x":520,"y":320,"wires":[["9665d4eb.4bb958"]]}],"cred":{},"packages":{}}
    })

    deviceStateManager.__setState('desired', 'state.flow.flow.assetId', `${testAssetID}`)
    deviceStateManager.__setState('desired', 'state.flow.flow.updateId', `${testUpdateID}`)
    deviceStateManager._notifyStateChange('desired', 'flow')
    await sleep(sleepTimeProcNodeRed)

    await nodeRedController.shutdownService()
    await sleep(sleepTimeProcNodeRed)
    /*
    for (let i in spy.mock.calls) {
      console.log(`spy.mock.calls[${i}] = ${spy.mock.calls[i][0]} / ${spy.mock.calls[i][1]} / ${spy.mock.calls[i][2]} / ${JSON.stringify(spy.mock.calls[i][3], null, 2)} / ${spy.mock.calls[i][4]}`)
    }
    */
    
    expect(spy.mock.calls[0][3].state).toBe('running')
    expect(spy.mock.calls[1][3]).toBe(true)
    expect(spy.mock.calls[2][3].state).toBe('deployPending')
    expect(spy.mock.calls[3][3].state).toBe('deploying')
    expect(spy.mock.calls[4][3].state).toBe('stopped')
    expect(spy.mock.calls[5][3].state).toBe('running')
    expect(spy.mock.calls[6][3].state).toBe('deployed')
  })

  test('Paramater Test - flow.flow deploy multiple', async () => {
    const testAssetID2nd = '12345670-89ab-cdef-0123-456789abcdef'
    const testUpdateID2nd = '12345670-89ab-cdef-0123-456789abcdef'

    jest.spyOn(connectorMessenger, 'sendRequest').mockImplementation(() => {
      return {url: "https://test"}
    })
    jest.spyOn(nodeRedController, '_downloadPackage').mockImplementationOnce(async (downloadUrl) => {
      return {"flow":[{"id":"25ea00ae.e05d4f","type":"tab","label":"flow1","disabled":false,"info":""},{"id":"f6feaa6c.9fcaf8","type":"inject","z":"15ea00ae.e05d4f","name":"","topic":"","payload":"","payloadType":"date","repeat":"10","crontab":"","once":false,"onceDelay":0.1,"x":370,"y":260,"wires":[["3e3e973f.f730a8"]]},{"id":"9665d4eb.4bb958","type":"debug","z":"15ea00ae.e05d4f","name":"","active":true,"tosidebar":true,"console":true,"tostatus":false,"complete":"payload","x":760,"y":360,"wires":[]},{"id":"3e3e973f.f730a8","type":"change","z":"15ea00ae.e05d4f","name":"","rules":[{"t":"set","p":"payload","pt":"msg","to":"test_deploy","tot":"str"}],"action":"","property":"","from":"","to":"","reg":false,"x":520,"y":320,"wires":[["9665d4eb.4bb958"]]}],"cred":{},"packages":{}}
    }).mockImplementationOnce(async (downloadUrl) => {
      return {"flow":[{"id":"7569899a.e7b398","type":"tab","label":"flow2","disabled":false,"info":""},{"id":"8705b5f4.6733f8","type":"inject","z":"7569899a.e7b398","name":"","topic":"","payload":"","payloadType":"date","repeat":"15","crontab":"","once":false,"onceDelay":0.1,"x":270,"y":180,"wires":[["d5a83647.f328c8"]]},{"id":"ff82fe1b.ddf3c","type":"debug","z":"7569899a.e7b398","name":"","active":true,"tosidebar":true,"console":true,"tostatus":false,"complete":"payload","x":560,"y":340,"wires":[]},{"id":"d5a83647.f328c8","type":"change","z":"7569899a.e7b398","name":"","rules":[{"t":"set","p":"payload","pt":"msg","to":"test_deploy_2nd","tot":"str"}],"action":"","property":"","from":"","to":"","reg":false,"x":400,"y":260,"wires":[["ff82fe1b.ddf3c"]]}],"cred":{},"packages":{}}
    })

    deviceStateManager.__setState('desired', 'state.flow.flow.assetId', `${testAssetID}`)
    deviceStateManager.__setState('desired', 'state.flow.flow.updateId', `${testUpdateID}`)
    deviceStateManager._notifyStateChange('desired', 'flow')
    await sleep(sleepTimeProcNodeRed)

    const spy = jest.spyOn(deviceStateManager, 'updateState')
    deviceStateManager.__setState('desired', 'state.flow.flow.assetId', `${testAssetID2nd}`)
    deviceStateManager.__setState('desired', 'state.flow.flow.updateId', `${testUpdateID2nd}`)
    deviceStateManager._notifyStateChange('desired', 'flow')
    await sleep(sleepTimeProcNodeRed)

    await nodeRedController.shutdownService()
    await sleep(sleepTimeProcNodeRed)
    
    expect(spy.mock.calls[0][3].state).toBe('deployPending')
    expect(spy.mock.calls[1][3].state).toBe('deploying')
    expect(spy.mock.calls[2][3].state).toBe('stopped')
    expect(spy.mock.calls[3][3].state).toBe('running')
    expect(spy.mock.calls[4][3].state).toBe('deployed')
  })

  test('Paramater Test - flow.enable = false', async () => {
    jest.spyOn(connectorMessenger, 'sendRequest').mockImplementation(() => {
      return {url: "https://test"}
    })
    jest.spyOn(nodeRedController, '_downloadPackage').mockImplementation(async (downloadUrl) => {
        return {"flow":[{"id":"25ea00ae.e05d4f","type":"tab","label":"flow1","disabled":false,"info":""},{"id":"f6feaa6c.9fcaf8","type":"inject","z":"15ea00ae.e05d4f","name":"","topic":"","payload":"","payloadType":"date","repeat":"10","crontab":"","once":false,"onceDelay":0.1,"x":370,"y":260,"wires":[["3e3e973f.f730a8"]]},{"id":"9665d4eb.4bb958","type":"debug","z":"15ea00ae.e05d4f","name":"","active":true,"tosidebar":true,"console":true,"tostatus":false,"complete":"payload","x":760,"y":360,"wires":[]},{"id":"3e3e973f.f730a8","type":"change","z":"15ea00ae.e05d4f","name":"","rules":[{"t":"set","p":"payload","pt":"msg","to":"test_deploy","tot":"str"}],"action":"","property":"","from":"","to":"","reg":false,"x":520,"y":320,"wires":[["9665d4eb.4bb958"]]}],"cred":{},"packages":{}}
    })

    deviceStateManager.__setState('desired', 'state.flow.flow.assetId', `${testAssetID}`)
    deviceStateManager.__setState('desired', 'state.flow.flow.updateId', `${testUpdateID}`)
    deviceStateManager._notifyStateChange('desired', 'flow')
    await sleep(sleepTimeProcNodeRed)

    const spy = jest.spyOn(deviceStateManager, 'updateState')
    deviceStateManager.__setState('desired', 'state.flow.enable', false)
    deviceStateManager._notifyStateChange('desired', 'flow')
    await sleep(sleepTimeProcNodeRed)

    await nodeRedController.shutdownService()
    await sleep(sleepTimeProcNodeRed)

    expect(spy.mock.calls[0][3]).toBe(false)
    expect(spy.mock.calls[1][3].state).toBe('stopped')
  })

  test('Paramater Test - flow.enable = false -> true', async () => {
    jest.spyOn(connectorMessenger, 'sendRequest').mockImplementation(() => {
      return {url: "https://test"}
    })
    jest.spyOn(nodeRedController, '_downloadPackage').mockImplementation(async (downloadUrl) => {
      return {"flow":[{"id":"25ea00ae.e05d4f","type":"tab","label":"flow1","disabled":false,"info":""},{"id":"f6feaa6c.9fcaf8","type":"inject","z":"15ea00ae.e05d4f","name":"","topic":"","payload":"","payloadType":"date","repeat":"10","crontab":"","once":false,"onceDelay":0.1,"x":370,"y":260,"wires":[["3e3e973f.f730a8"]]},{"id":"9665d4eb.4bb958","type":"debug","z":"15ea00ae.e05d4f","name":"","active":true,"tosidebar":true,"console":true,"tostatus":false,"complete":"payload","x":760,"y":360,"wires":[]},{"id":"3e3e973f.f730a8","type":"change","z":"15ea00ae.e05d4f","name":"","rules":[{"t":"set","p":"payload","pt":"msg","to":"test_deploy","tot":"str"}],"action":"","property":"","from":"","to":"","reg":false,"x":520,"y":320,"wires":[["9665d4eb.4bb958"]]}],"cred":{},"packages":{}}
    })

    deviceStateManager.__setState('desired', 'state.flow.flow.assetId', `${testAssetID}`)
    deviceStateManager.__setState('desired', 'state.flow.flow.updateId', `${testUpdateID}`)
    deviceStateManager._notifyStateChange('desired', 'flow')
    await sleep(sleepTimeProcNodeRed)

    deviceStateManager.__setState('desired', 'state.flow.enable', false)
    deviceStateManager._notifyStateChange('desired', 'flow')
    await sleep(sleepTimeProcNodeRed)

    const spy = jest.spyOn(deviceStateManager, 'updateState')
    deviceStateManager.__setState('desired', 'state.flow.enable', true)
    deviceStateManager._notifyStateChange('desired', 'flow')
    await sleep(sleepTimeProcNodeRed)

    await nodeRedController.shutdownService()
    await sleep(sleepTimeProcNodeRed)

    expect(spy.mock.calls[0][3]).toBe(true)
    expect(spy.mock.calls[1][3].state).toBe('running')
  })

  test('Error Injection Test - Failed to get flow download URL', async () => {
    const spy = jest.spyOn(deviceStateManager, 'updateState')
    const spy2 = jest.spyOn(connectorMessenger, 'sendRequest').mockImplementation(() => {
      throw new Error('error sendRequest')
    })
    jest.spyOn(nodeRedController, '_downloadPackage').mockImplementation(async (downloadUrl) => {
      return {"flow":[{"id":"25ea00ae.e05d4f","type":"tab","label":"flow1","disabled":false,"info":""},{"id":"f6feaa6c.9fcaf8","type":"inject","z":"15ea00ae.e05d4f","name":"","topic":"","payload":"","payloadType":"date","repeat":"10","crontab":"","once":false,"onceDelay":0.1,"x":370,"y":260,"wires":[["3e3e973f.f730a8"]]},{"id":"9665d4eb.4bb958","type":"debug","z":"15ea00ae.e05d4f","name":"","active":true,"tosidebar":true,"console":true,"tostatus":false,"complete":"payload","x":760,"y":360,"wires":[]},{"id":"3e3e973f.f730a8","type":"change","z":"15ea00ae.e05d4f","name":"","rules":[{"t":"set","p":"payload","pt":"msg","to":"test_deploy","tot":"str"}],"action":"","property":"","from":"","to":"","reg":false,"x":520,"y":320,"wires":[["9665d4eb.4bb958"]]}],"cred":{},"packages":{}}
    })

    deviceStateManager.__setState('desired', 'state.flow.flow.assetId', `${testAssetID}`)
    deviceStateManager.__setState('desired', 'state.flow.flow.updateId', `${testUpdateID}`)
    deviceStateManager._notifyStateChange('desired', 'flow')
    await sleep(sleepTimeProcNodeRed)

    await nodeRedController.shutdownService()
    await sleep(sleepTimeProcNodeRed)
    
    expect(spy2.mock.calls.length).toBe(3)
    expect(spy.mock.calls[0][3].state).toBe('running')
    expect(spy.mock.calls[1][3]).toBe(true)
    expect(spy.mock.calls[2][3].state).toBe('deployPending')
    expect(spy.mock.calls[3][3].state).toBe('deploying')
    expect(spy.mock.calls[4][3].state).toBe('deployPending')
    expect(spy.mock.calls[5][3].state).toBe('deploying')
    expect(spy.mock.calls[6][3].state).toBe('deployPending')
    expect(spy.mock.calls[7][3].state).toBe('deploying')
    expect(spy.mock.calls[8][3].state).toBe('deployPending')
    expect(spy.mock.calls[9][3].state).toBe('deployFail')
  })

  test('Error Injection Test - Failed to get download package', async () => {
    const spy = jest.spyOn(deviceStateManager, 'updateState')
    const spy2 = jest.spyOn(connectorMessenger, 'sendRequest').mockImplementation(() => {
      return {url: "https://test"}
    })
    jest.spyOn(nodeRedController, '_downloadPackage').mockImplementation(async (downloadUrl) => {
      throw new Error('error _downloadPackage')
    })

    deviceStateManager.__setState('desired', 'state.flow.flow.assetId', `${testAssetID}`)
    deviceStateManager.__setState('desired', 'state.flow.flow.updateId', `${testUpdateID}`)
    deviceStateManager._notifyStateChange('desired', 'flow')
    await sleep(sleepTimeProcNodeRed)

    await nodeRedController.shutdownService()
    await sleep(sleepTimeProcNodeRed)
    
    expect(spy2.mock.calls.length).toBe(3)
    expect(spy.mock.calls[0][3].state).toBe('running')
    expect(spy.mock.calls[1][3]).toBe(true)
    expect(spy.mock.calls[2][3].state).toBe('deployPending')
    expect(spy.mock.calls[3][3].state).toBe('deploying')
    expect(spy.mock.calls[4][3].state).toBe('deployPending')
    expect(spy.mock.calls[5][3].state).toBe('deploying')
    expect(spy.mock.calls[6][3].state).toBe('deployPending')
    expect(spy.mock.calls[7][3].state).toBe('deploying')
    expect(spy.mock.calls[8][3].state).toBe('deployPending')
    expect(spy.mock.calls[9][3].state).toBe('deployFail')
  })
})
