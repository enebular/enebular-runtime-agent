import * as utils from '../src/utils'
import DummyAgent from './helpers/dummy-agent'
import {
  deleteDir,
  deleteFile,
  getFileObj
} from './helpers/utils'

const fs = require('fs')
const path = require('path');

let useTestFile = 'default'
const testAssetID = '5b6aef66-909e-4ae8-8174-ab140c372935'
let reportedTimeout = 10000


jest.setTimeout(10000) 

/*
  Mock Function Start
*/
let progressRequestErrorFlag = false
const progressRequestMock = jest.fn((url, destPath, obj) => {
  if(progressRequestErrorFlag === true) {
    throw new Error('error injection: file download')
  }
  let srcPath = path.resolve(__dirname, `./data/${useTestFile}`)
  fs.copyFileSync(srcPath, destPath);
})

let execSpawnErrorFlag = false
const execSpawnMock = jest.fn((args, env, cwd, obj) => {
  if(execSpawnErrorFlag === true) {
    throw new Error('error injection: spawn')
  }
})
/*
  Mock Function End
*/


describe('File Deploy Test', () => {
  let utilSpy
  let dummyAgent

  beforeAll(() => {
  });

  beforeEach(() => {
    dummyAgent = new DummyAgent(__dirname)
    utilSpy = jest.spyOn(utils, 'progressRequest').mockImplementation(progressRequestMock);
  });

  afterEach(() => {
    jest.restoreAllMocks()
    dummyAgent = null
    progressRequestErrorFlag = false
    execSpawnErrorFlag = false

    deleteFile(path.resolve(__dirname, '.enebular-assets.json'))
    deleteDir(path.resolve(__dirname, './assets'))

  });
  
  afterAll(() => {
  })

  test('Paramater Test - normal (Exec:no, Hook:no)', async () => {

    const deviceStateManager = dummyAgent.deviceStateManager()
    const assetManager = dummyAgent.assetManager()

    await assetManager.setup()
    assetManager.activate(true)
    await dummyAgent.sleep(1)

    useTestFile = 'no-exec-file.txt'
    let testDir = 'testDir'
    let fileObj = await getFileObj(useTestFile)
    deviceStateManager.__defaultState('desired')
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.filename`, fileObj.filename)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.integrity`, fileObj.integrity)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.size`, fileObj.size)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.destPath`, testDir)

    deviceStateManager._notifyStateChange('desired', 'assets')

    let result = await dummyAgent.waitReported(reportedTimeout)
    expect(result).toBe('deployed');
  
    var isExist;
    try {
      fs.statSync(path.resolve(__dirname, `./assets/${testDir}/${useTestFile}`));
      isExist = true;
    } catch(err) {
      isExist = false;
    }

    expect(isExist).toBe(true)
  });

  test('Paramater Test - integrity error (Exec:no, Hook:no)', async () => {

    const deviceStateManager = dummyAgent.deviceStateManager()
    const assetManager = dummyAgent.assetManager()

    await assetManager.setup()
    assetManager.activate(true)
    await dummyAgent.sleep(1)

    useTestFile = 'no-exec-file.txt'
    let testDir = 'testDir'
    let fileObj = await getFileObj(useTestFile)
    deviceStateManager.__defaultState('desired')
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.filename`, fileObj.filename)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.integrity`, 'error-integrity')
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.size`, fileObj.size)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.destPath`, testDir)

    deviceStateManager._notifyStateChange('desired', 'assets')

    let result = await dummyAgent.waitReported(reportedTimeout)
    expect(result).toBe('deployFail');
  });

  test('Paramater Test - size error (Exec:no, Hook:no)', async () => {

    const deviceStateManager = dummyAgent.deviceStateManager()
    const assetManager = dummyAgent.assetManager()

    await assetManager.setup()
    assetManager.activate(true)
    await dummyAgent.sleep(1)

    useTestFile = 'no-exec-file.txt'
    let testDir = 'testDir'
    let fileObj = await getFileObj(useTestFile)
    deviceStateManager.__defaultState('desired')
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.filename`, fileObj.filename)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.integrity`, fileObj.integrity)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.size`, 14101041152000)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.destPath`, testDir)

    deviceStateManager._notifyStateChange('desired', 'assets')

    let result = await dummyAgent.waitReported(reportedTimeout)
    expect(result).toBe('deployFail');
  });

  test('Paramater Test - execution normal (Exec:yes, Hook:no)', async () => {

    const deviceStateManager = dummyAgent.deviceStateManager()
    const assetManager = dummyAgent.assetManager()

    await assetManager.setup()
    assetManager.activate(true)
    await dummyAgent.sleep(1)

    useTestFile = 'exec-file.sh'
    let testDir = 'testDir'
    let fileObj = await getFileObj(useTestFile)
    deviceStateManager.__defaultState('desired')
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.filename`, fileObj.filename)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.integrity`, fileObj.integrity)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.size`, fileObj.size)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.exec`, true)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.execConfig`, {maxTime:2})
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.destPath`, testDir)

    deviceStateManager._notifyStateChange('desired', 'assets')

    let result = await dummyAgent.waitReported(reportedTimeout)
    expect(result).toBe('deployed');
  
    var isExist;
    try {
      fs.statSync(path.resolve(__dirname, `./assets/${testDir}/${useTestFile}`));
      isExist = true;
    } catch(err) {
      isExist = false;
    }

    expect(isExist).toBe(true)
  });

  test('Paramater Test - args envs normal (Exec:yes, Hook:no)', async () => {

    const deviceStateManager = dummyAgent.deviceStateManager()
    const assetManager = dummyAgent.assetManager()

    await assetManager.setup()
    assetManager.activate(true)
    await dummyAgent.sleep(1)

    useTestFile = 'exec-file-arg-env.sh'
    let testDir = 'testDir'
    let fileObj = await getFileObj(useTestFile)
    deviceStateManager.__defaultState('desired')
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.filename`, fileObj.filename)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.integrity`, fileObj.integrity)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.size`, fileObj.size)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.exec`, true)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.execConfig`, {maxTime:2, args:'aaa bbb', envs:['TEST_ENV_VAR1=1','TEST_ENV_VAR2=2']})
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.destPath`, testDir)

    deviceStateManager._notifyStateChange('desired', 'assets')

    let result = await dummyAgent.waitReported(reportedTimeout)
    expect(result).toBe('deployed');
  
    var isExist;
    try {
      fs.statSync(path.resolve(__dirname, `./assets/${testDir}/${useTestFile}`));
      isExist = true;
    } catch(err) {
      isExist = false;
    }

    expect(isExist).toBe(true)
  });

  test('Paramater Test - less than maxTime (Exec:yes, Hook:no)', async () => {

    const deviceStateManager = dummyAgent.deviceStateManager()
    const assetManager = dummyAgent.assetManager()

    await assetManager.setup()
    assetManager.activate(true)
    await dummyAgent.sleep(1)

    useTestFile = 'exec-file-wait.sh'
    let testDir = 'testDir'
    let fileObj = await getFileObj(useTestFile)
    deviceStateManager.__defaultState('desired')
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.filename`, fileObj.filename)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.integrity`, fileObj.integrity)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.size`, fileObj.size)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.exec`, true)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.execConfig`, {maxTime:2, args:'1'})
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.destPath`, testDir)

    deviceStateManager._notifyStateChange('desired', 'assets')

    let result = await dummyAgent.waitReported(reportedTimeout)
    expect(result).toBe('deployed');
  
    var isExist;
    try {
      fs.statSync(path.resolve(__dirname, `./assets/${testDir}/${useTestFile}`));
      isExist = true;
    } catch(err) {
      isExist = false;
    }

    expect(isExist).toBe(true)
  });

  test('Paramater Test - over maxTime (Exec:yes, Hook:no)', async () => {

    const deviceStateManager = dummyAgent.deviceStateManager()
    const assetManager = dummyAgent.assetManager()

    await assetManager.setup()
    assetManager.activate(true)
    await dummyAgent.sleep(1)

    useTestFile = 'exec-file-wait.sh'
    let testDir = 'testDir'
    let fileObj = await getFileObj(useTestFile)
    deviceStateManager.__defaultState('desired')
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.filename`, fileObj.filename)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.integrity`, fileObj.integrity)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.size`, fileObj.size)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.exec`, true)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.execConfig`, {maxTime:2, args:'3'})
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.destPath`, testDir)

    deviceStateManager._notifyStateChange('desired', 'assets')

    let result = await dummyAgent.waitReported(reportedTimeout)
    expect(result).toBe('deployFail');
  });

  test('Paramater Test - assetPath normal (Exec:no, Hook:Pre-Deploy)', async () => {

    const deviceStateManager = dummyAgent.deviceStateManager()
    const assetManager = dummyAgent.assetManager()
    
    await assetManager.setup()
    assetManager.activate(true)
    await dummyAgent.sleep(1)

    useTestFile = 'no-exec-file.txt'
    let testDir = 'testDir'
    let fileObj = await getFileObj(useTestFile)
    deviceStateManager.__defaultState('desired')
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.filename`, fileObj.filename)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.integrity`, fileObj.integrity)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.size`, fileObj.size)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.destPath`, testDir)
    let hookObj = [
      {
        "stage": "preDeploy",
        "type": "asset",
        "maxTime": 2,
        "assetTypeConfig": {
          "assetPath": "../data/exec-file-wait.sh"
        }
      }
    ]
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.hooks`, hookObj)

    deviceStateManager._notifyStateChange('desired', 'assets')

    let result = await dummyAgent.waitReported(reportedTimeout)
    expect(result).toBe('deployed');

    var isExist;
    try {
      fs.statSync(path.resolve(__dirname, `./assets/${testDir}/${useTestFile}`));
      isExist = true;
    } catch(err) {
      isExist = false;
    }

    expect(isExist).toBe(true)
  });

  test('Paramater Test - assetPath error (Exec:no, Hook:Pre-Deploy)', async () => {

    const deviceStateManager = dummyAgent.deviceStateManager()
    const assetManager = dummyAgent.assetManager()
    
    await assetManager.setup()
    assetManager.activate(true)
    await dummyAgent.sleep(1)

    useTestFile = 'no-exec-file.txt'
    let testDir = 'testDir'
    let fileObj = await getFileObj(useTestFile)
    deviceStateManager.__defaultState('desired')
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.filename`, fileObj.filename)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.integrity`, fileObj.integrity)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.size`, fileObj.size)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.destPath`, testDir)
    let hookObj = [
      {
        "stage": "preDeploy",
        "type": "asset",
        "maxTime": 2,
        "assetTypeConfig": {
          "assetPath": "../data/not-exist-file.sh"
        }
      }
    ]
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.hooks`, hookObj)

    deviceStateManager._notifyStateChange('desired', 'assets')

    let result = await dummyAgent.waitReported(reportedTimeout)
    expect(result).toBe('deployFail');

  });

  test('Paramater Test - less than maxTime (Exec:no, Hook:Pre-Deploy)', async () => {

    const deviceStateManager = dummyAgent.deviceStateManager()
    const assetManager = dummyAgent.assetManager()
    
    await assetManager.setup()
    assetManager.activate(true)
    await dummyAgent.sleep(1)

    useTestFile = 'no-exec-file.txt'
    let testDir = 'testDir'
    let fileObj = await getFileObj(useTestFile)
    deviceStateManager.__defaultState('desired')
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.filename`, fileObj.filename)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.integrity`, fileObj.integrity)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.size`, fileObj.size)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.destPath`, testDir)
    let hookObj = [
      {
        "stage": "preDeploy",
        "type": "asset",
        "maxTime": 2,
        "assetTypeConfig": {
          "assetPath": "../data/exec-file-wait.sh"
        }
      }
    ]
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.hooks`, hookObj)

    deviceStateManager._notifyStateChange('desired', 'assets')

    let result = await dummyAgent.waitReported(reportedTimeout)
    expect(result).toBe('deployed');

    var isExist;
    try {
      fs.statSync(path.resolve(__dirname, `./assets/${testDir}/${useTestFile}`));
      isExist = true;
    } catch(err) {
      isExist = false;
    }

    expect(isExist).toBe(true)
  });

  test('Paramater Test - over maxTime (Exec:no, Hook:Pre-Deploy)', async () => {

    const deviceStateManager = dummyAgent.deviceStateManager()
    const assetManager = dummyAgent.assetManager()
    
    await assetManager.setup()
    assetManager.activate(true)
    await dummyAgent.sleep(1)

    useTestFile = 'no-exec-file.txt'
    let testDir = 'testDir'
    let fileObj = await getFileObj(useTestFile)
    deviceStateManager.__defaultState('desired')
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.filename`, fileObj.filename)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.integrity`, fileObj.integrity)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.size`, fileObj.size)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.destPath`, testDir)
    let hookObj = [
      {
        "stage": "preDeploy",
        "type": "asset",
        "maxTime": 0,
        "assetTypeConfig": {
          "assetPath": "../data/exec-file-wait.sh"
        }
      }
    ]
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.hooks`, hookObj)

    deviceStateManager._notifyStateChange('desired', 'assets')

    let result = await dummyAgent.waitReported(reportedTimeout)
    expect(result).toBe('deployFail');

  });

  test('Paramater Test - assetPath normal (Exec:no, Hook:Post-Deploy)', async () => {

    const deviceStateManager = dummyAgent.deviceStateManager()
    const assetManager = dummyAgent.assetManager()
    
    await assetManager.setup()
    assetManager.activate(true)
    await dummyAgent.sleep(1)

    useTestFile = 'no-exec-file.txt'
    let testDir = 'testDir'
    let fileObj = await getFileObj(useTestFile)
    deviceStateManager.__defaultState('desired')
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.filename`, fileObj.filename)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.integrity`, fileObj.integrity)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.size`, fileObj.size)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.destPath`, testDir)
    let hookObj = [
      {
        "stage": "postDeploy",
        "type": "asset",
        "maxTime": 2,
        "assetTypeConfig": {
          "assetPath": "../data/exec-file-wait.sh"
        }
      }
    ]
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.hooks`, hookObj)

    deviceStateManager._notifyStateChange('desired', 'assets')

    let result = await dummyAgent.waitReported(reportedTimeout)
    expect(result).toBe('deployed');

    var isExist;
    try {
      fs.statSync(path.resolve(__dirname, `./assets/${testDir}/${useTestFile}`));
      isExist = true;
    } catch(err) {
      isExist = false;
    }

    expect(isExist).toBe(true)
  });

  test('Paramater Test - assetPath error (Exec:no, Hook:Post-Deploy)', async () => {

    const deviceStateManager = dummyAgent.deviceStateManager()
    const assetManager = dummyAgent.assetManager()
    
    await assetManager.setup()
    assetManager.activate(true)
    await dummyAgent.sleep(1)

    useTestFile = 'no-exec-file.txt'
    let testDir = 'testDir'
    let fileObj = await getFileObj(useTestFile)
    deviceStateManager.__defaultState('desired')
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.filename`, fileObj.filename)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.integrity`, fileObj.integrity)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.size`, fileObj.size)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.destPath`, testDir)
    let hookObj = [
      {
        "stage": "postDeploy",
        "type": "asset",
        "maxTime": 2,
        "assetTypeConfig": {
          "assetPath": "../data/not-exist-file.sh"
        }
      }
    ]
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.hooks`, hookObj)

    deviceStateManager._notifyStateChange('desired', 'assets')

    let result = await dummyAgent.waitReported(reportedTimeout)
    expect(result).toBe('deployFail');

  });

  test('Paramater Test - less than maxTime (Exec:no, Hook:Post-Deploy)', async () => {

    const deviceStateManager = dummyAgent.deviceStateManager()
    const assetManager = dummyAgent.assetManager()
    
    await assetManager.setup()
    assetManager.activate(true)
    await dummyAgent.sleep(1)

    useTestFile = 'no-exec-file.txt'
    let testDir = 'testDir'
    let fileObj = await getFileObj(useTestFile)
    deviceStateManager.__defaultState('desired')
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.filename`, fileObj.filename)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.integrity`, fileObj.integrity)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.size`, fileObj.size)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.destPath`, testDir)
    let hookObj = [
      {
        "stage": "postDeploy",
        "type": "asset",
        "maxTime": 2,
        "assetTypeConfig": {
          "assetPath": "../data/exec-file-wait.sh"
        }
      }
    ]
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.hooks`, hookObj)

    deviceStateManager._notifyStateChange('desired', 'assets')

    let result = await dummyAgent.waitReported(reportedTimeout)
    expect(result).toBe('deployed');

    var isExist;
    try {
      fs.statSync(path.resolve(__dirname, `./assets/${testDir}/${useTestFile}`));
      isExist = true;
    } catch(err) {
      isExist = false;
    }

    expect(isExist).toBe(true)
  });

  test('Paramater Test - over maxTime (Exec:no, Hook:Post-Deploy)', async () => {

    const deviceStateManager = dummyAgent.deviceStateManager()
    const assetManager = dummyAgent.assetManager()
    
    await assetManager.setup()
    assetManager.activate(true)
    await dummyAgent.sleep(1)

    useTestFile = 'no-exec-file.txt'
    let testDir = 'testDir'
    let fileObj = await getFileObj(useTestFile)
    deviceStateManager.__defaultState('desired')
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.filename`, fileObj.filename)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.integrity`, fileObj.integrity)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.size`, fileObj.size)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.destPath`, testDir)
    let hookObj = [
      {
        "stage": "postDeploy",
        "type": "asset",
        "maxTime": 0,
        "assetTypeConfig": {
          "assetPath": "../data/exec-file-wait.sh"
        }
      }
    ]
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.hooks`, hookObj)

    deviceStateManager._notifyStateChange('desired', 'assets')

    let result = await dummyAgent.waitReported(reportedTimeout)
    expect(result).toBe('deployFail');

  });

  test('Paramater Test - all paramager (Exec:yes, Hook:Pre/Post-Deploy)', async () => {

    const deviceStateManager = dummyAgent.deviceStateManager()
    const assetManager = dummyAgent.assetManager()

    await assetManager.setup()
    assetManager.activate(true)
    await dummyAgent.sleep(1)

    useTestFile = 'exec-file-arg-env.sh'
    let testDir = 'testDir'
    let fileObj = await getFileObj(useTestFile)
    deviceStateManager.__defaultState('desired')
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.filename`, fileObj.filename)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.integrity`, fileObj.integrity)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.size`, fileObj.size)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.exec`, true)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.execConfig`, {maxTime:2, args:'aaa bbb', envs:['TEST_ENV_VAR1=1','TEST_ENV_VAR2=2']})
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.destPath`, testDir)
    let hookObj = [
      {
        "stage": "preDeploy",
        "type": "asset",
        "maxTime": 2,
        "assetTypeConfig": {
          "assetPath": "../data/exec-file-wait.sh"
        }
      },
      {
        "stage": "postDeploy",
        "type": "asset",
        "maxTime": 2,
        "assetTypeConfig": {
          "assetPath": "../data/exec-file-wait.sh"
        }
      }
    ]
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.hooks`, hookObj)

    deviceStateManager._notifyStateChange('desired', 'assets')

    let result = await dummyAgent.waitReported(reportedTimeout)
    expect(result).toBe('deployed');

    var isExist;
    try {
      fs.statSync(path.resolve(__dirname, `./assets/${testDir}/${useTestFile}`));
      isExist = true;
    } catch(err) {
      isExist = false;
    }

    expect(isExist).toBe(true)

    var isExist;
    try {
      fs.statSync(path.resolve(__dirname, `./assets/${testDir}/${useTestFile}`));
      isExist = true;
    } catch(err) {
      isExist = false;
    }

    expect(isExist).toBe(true)
  });

  test('Error Injection Test - download file error', async () => {

    const deviceStateManager = dummyAgent.deviceStateManager()
    const assetManager = dummyAgent.assetManager()
    
    await assetManager.setup()
    assetManager.activate(true)
    await dummyAgent.sleep(1)

    useTestFile = 'no-exec-file.txt'
    let testDir = 'testDir'
    let fileObj = await getFileObj(useTestFile)
    deviceStateManager.__defaultState('desired')
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.filename`, fileObj.filename)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.integrity`, fileObj.integrity)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.size`, fileObj.size)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.destPath`, testDir)

    progressRequestErrorFlag = true
    deviceStateManager._notifyStateChange('desired', 'assets')

    let result = await dummyAgent.waitReported(reportedTimeout)
    expect(result).toBe('deployFail');

  });

  test('Error Injection Test - get URL error', async () => {

    const deviceStateManager = dummyAgent.deviceStateManager()
    const assetManager = dummyAgent.assetManager()
    const agentManagerMediator = dummyAgent.AgentManagerMediator()
    
    await assetManager.setup()
    assetManager.activate(true)
    await dummyAgent.sleep(1)

    useTestFile = 'no-exec-file.txt'
    let testDir = 'testDir'
    let fileObj = await getFileObj(useTestFile)
    deviceStateManager.__defaultState('desired')
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.filename`, fileObj.filename)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.integrity`, fileObj.integrity)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.size`, fileObj.size)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.destPath`, testDir)

    agentManagerMediator.__setErrorInjection(true)

    deviceStateManager._notifyStateChange('desired', 'assets')

    let result = await dummyAgent.waitReported(reportedTimeout)
    expect(result).toBe('deployFail');

  });

  test('Error Injection Test - Deployed File execution error', async () => {

    jest.spyOn(utils, 'execSpawn').mockImplementation(execSpawnMock);
    execSpawnErrorFlag = true
    
    const deviceStateManager = dummyAgent.deviceStateManager()
    const assetManager = dummyAgent.assetManager()

    await assetManager.setup()
    assetManager.activate(true)
    await dummyAgent.sleep(1)

    useTestFile = 'exec-file.sh'
    let testDir = 'testDir'
    let fileObj = await getFileObj(useTestFile)
    deviceStateManager.__defaultState('desired')
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.filename`, fileObj.filename)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.integrity`, fileObj.integrity)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.size`, fileObj.size)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.exec`, true)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.execConfig`, {maxTime:2})
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.destPath`, testDir)

    deviceStateManager._notifyStateChange('desired', 'assets')

    let result = await dummyAgent.waitReported(reportedTimeout)
    expect(result).toBe('deployFail');

  });

  test('Error Injection Test - Pre-Deploy error', async () => {

    jest.spyOn(utils, 'execSpawn').mockImplementation(execSpawnMock);
    execSpawnErrorFlag = true

    const deviceStateManager = dummyAgent.deviceStateManager()
    const assetManager = dummyAgent.assetManager()
    
    await assetManager.setup()
    assetManager.activate(true)
    await dummyAgent.sleep(1)

    useTestFile = 'no-exec-file.txt'
    let testDir = 'testDir'
    let fileObj = await getFileObj(useTestFile)
    deviceStateManager.__defaultState('desired')
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.filename`, fileObj.filename)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.integrity`, fileObj.integrity)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.size`, fileObj.size)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.destPath`, testDir)
    let hookObj = [
      {
        "stage": "preDeploy",
        "type": "asset",
        "maxTime": 2,
        "assetTypeConfig": {
          "assetPath": "../data/exec-file-wait.sh"
        }
      }
    ]
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.hooks`, hookObj)

    deviceStateManager._notifyStateChange('desired', 'assets')

    let result = await dummyAgent.waitReported(reportedTimeout)
    expect(result).toBe('deployFail');

  });

  test('Error Injection Test - Post-Deploy error', async () => {

    jest.spyOn(utils, 'execSpawn').mockImplementation(execSpawnMock);
    execSpawnErrorFlag = true
    
    const deviceStateManager = dummyAgent.deviceStateManager()
    const assetManager = dummyAgent.assetManager()

    await assetManager.setup()
    assetManager.activate(true)
    await dummyAgent.sleep(1)

    useTestFile = 'no-exec-file.txt'
    let testDir = 'testDir'
    let fileObj = await getFileObj(useTestFile)
    deviceStateManager.__defaultState('desired')
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.filename`, fileObj.filename)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.integrity`, fileObj.integrity)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.size`, fileObj.size)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.destPath`, testDir)
    let hookObj = [
      {
        "stage": "postDeploy",
        "type": "asset",
        "maxTime": 2,
        "assetTypeConfig": {
          "assetPath": "../data/exec-file-wait.sh"
        }
      }
    ]
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.hooks`, hookObj)

    deviceStateManager._notifyStateChange('desired', 'assets')

    let result = await dummyAgent.waitReported(reportedTimeout)
    expect(result).toBe('deployFail');

  });
/*

  test('Deploy - Fail : no setup ', async () => {
    const _assetManager = dummyAgent.assetManager()

    expect(() => {_assetManager.activate(true)}).toThrowError('Attempted to activate asset-man when not initialized')
  
  });

  test('Deploy - Fail : no activate ', async () => {
    const _deviceStateManager = dummyAgent.deviceStateManager()
    const _assetManager = dummyAgent.assetManager()

    await _assetManager.setup()

    await dummyAgent.sleep(1)

    _deviceStateManager._notifyStateChange('desired', 'assets')

    let result = await dummyAgent.waitReported(2000)
    expect(result).toBe('timeout');
  });

*/
});
