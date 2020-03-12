import * as utils from '../src/utils'
import DummyAgent from './helpers/dummy-agent'
import {
  deleteDir,
  deleteFile,
  getFileObj,
} from './helpers/utils'
import mkdirp from 'mkdirp'

const fs = require('fs')
const path = require('path');

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
  let fileName = path.basename(destPath)
  let srcPath = path.resolve(__dirname, `./data/${fileName}`)
  fs.copyFileSync(srcPath, destPath);
})

let execSpawnErrorFlag = false
const execSpawnMock = jest.fn((args, env, cwd, obj) => {
  if(execSpawnErrorFlag === true) {
    throw new Error('error injection: spawn')
  }
})

let unlinkSyncErrorFlag = false
const unlinkSyncMock = jest.fn((path) => {
  if(unlinkSyncErrorFlag === true) {
    throw new Error('error injection: unlinkSync')
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
    unlinkSyncErrorFlag = false

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

    let useTestFile = 'no-exec-file.txt'
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

    let useTestFile = 'no-exec-file.txt'
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

    let useTestFile = 'no-exec-file.txt'
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

    let useTestFile = 'exec-file.sh'
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

    let useTestFile = 'exec-file-arg-env.sh'
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

    let useTestFile = 'exec-file-wait.sh'
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

    let useTestFile = 'exec-file-wait.sh'
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

    let useTestFile = 'no-exec-file.txt'
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

    let useTestFile = 'no-exec-file.txt'
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

    let useTestFile = 'no-exec-file.txt'
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

    let useTestFile = 'no-exec-file.txt'
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

    let useTestFile = 'no-exec-file.txt'
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

    let useTestFile = 'no-exec-file.txt'
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

    let useTestFile = 'no-exec-file.txt'
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

    let useTestFile = 'no-exec-file.txt'
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

    let useTestFile = 'exec-file-arg-env.sh'
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

    let useTestFile = 'no-exec-file.txt'
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

    let useTestFile = 'no-exec-file.txt'
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

    let useTestFile = 'exec-file.sh'
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

    let useTestFile = 'no-exec-file.txt'
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

  test('Composite Test - Multiple Assets deploy', async () => {

    const deviceStateManager = dummyAgent.deviceStateManager()
    const assetManager = dummyAgent.assetManager()

    await assetManager.setup()
    assetManager.activate(true)
    await dummyAgent.sleep(1)

    let useTestFile = 'no-exec-file.txt'
    let testDir = 'firstDir'
    let fileObj = await getFileObj(useTestFile)
    deviceStateManager.__defaultState('desired')
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.filename`, fileObj.filename)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.integrity`, fileObj.integrity)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.size`, fileObj.size)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.destPath`, testDir)

    let useTestFile2 = 'no-exec-file.txt'
    let testDir2 = 'soconcdDir'
    let fileObj2 = await getFileObj(useTestFile2)
    let testAssetID2 = "1f84bc92-3242-4ffb-af26-93b79f72b81f"
    let secondAsset = {
        "updateId": "f1d375aa-97fe-4acf-94c1-641221e3516d",
        "ts": 1583486570186,
        "config": {
            "name": "file-deploy-test2",
            "type": "file",
            "fileTypeConfig": {
                "src": "internal",
                "internalSrcConfig": {
                    "stored": true,
                    "key": "9437c557-5955-4984-a13d-2dc723223cee"
                },
                "filename": fileObj2.filename,
                "integrity": fileObj2.integrity,
                "size": fileObj2.size
            },
            "destPath": testDir2
        }
    }
    deviceStateManager.__setState('desired', `assets.${testAssetID2}`, secondAsset)

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

    await dummyAgent.sleep(1000)

    result = await dummyAgent.waitReported(reportedTimeout)
    expect(result).toBe('deployed');

    try {
      fs.statSync(path.resolve(__dirname, `./assets/${testDir2}/${useTestFile2}`));
      isExist = true;
    } catch(err) {
      isExist = false;
    }

    expect(isExist).toBe(true)

  });

  test('Composite Test - file remove', async () => {

    const deviceStateManager = dummyAgent.deviceStateManager()
    const assetManager = dummyAgent.assetManager()

    await assetManager.setup()
    assetManager.activate(true)
    await dummyAgent.sleep(1)

    let useTestFile = 'no-exec-file.txt'
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

    await dummyAgent.sleep(1000)
    
    deviceStateManager.__defaultState('desired')
    deviceStateManager.__setState('desired', `assets`, {})

    deviceStateManager._notifyStateChange('desired', 'assets')

    await dummyAgent.sleep(1000)
    result = await dummyAgent.waitReported(reportedTimeout)
    expect(result).toBe('remove');
  
    try {
      fs.statSync(path.resolve(__dirname, `./assets/${testDir}/${useTestFile}`));
      isExist = true;
    } catch(err) {
      isExist = false;
    }

    expect(isExist).toBe(false)
  });

  test('Composite Test - file remove error', async () => {

    jest.spyOn(fs, 'unlinkSync').mockImplementation(unlinkSyncMock);
    unlinkSyncErrorFlag = true

    const deviceStateManager = dummyAgent.deviceStateManager()
    const assetManager = dummyAgent.assetManager()

    await assetManager.setup()
    assetManager.activate(true)
    await dummyAgent.sleep(1)

    let useTestFile = 'no-exec-file.txt'
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

    await dummyAgent.sleep(1000)
    
    deviceStateManager.__defaultState('desired')
    deviceStateManager.__setState('desired', `assets`, {})

    deviceStateManager._notifyStateChange('desired', 'assets')

    await dummyAgent.sleep(1000)
    result = await dummyAgent.waitReported(reportedTimeout)
    expect(result).toBe('removeFail');

  });

  test('Composite Test - re-deploy same asset', async () => {

    const deviceStateManager = dummyAgent.deviceStateManager()
    const assetManager = dummyAgent.assetManager()

    await assetManager.setup()
    assetManager.activate(true)


    let useTestFile = 'no-exec-file.txt'
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

    deviceStateManager._notifyStateChange('desired', 'assets')
    await dummyAgent.sleep(1000)

    result = await dummyAgent.waitReported(reportedTimeout)
    expect(result).toBe('deployed');
  
    isExist;
    try {
      fs.statSync(path.resolve(__dirname, `./assets/${testDir}/${useTestFile}`));
      isExist = true;
    } catch(err) {
      isExist = false;
    }

    expect(isExist).toBe(true)
  });

  test('Composite Test - re-deploy same asset and not same asset', async () => {

    const deviceStateManager = dummyAgent.deviceStateManager()
    const assetManager = dummyAgent.assetManager()

    await assetManager.setup()
    assetManager.activate(true)


    let useTestFile = 'no-exec-file.txt'
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

    useTestFile = 'exec-file.sh'
    fileObj = await getFileObj(useTestFile)
    let testAssetID2 = "1f84bc92-3242-4ffb-af26-93b79f72b81f"
    let assetObj = {
        "updateId": "f1d375aa-97fe-4acf-94c1-641221e3516d",
        "ts": 1583486570186,
        "config": {
            "name": "file-deploy-test2",
            "type": "file",
            "fileTypeConfig": {
                "src": "internal",
                "internalSrcConfig": {
                    "stored": true,
                    "key": "9437c557-5955-4984-a13d-2dc723223cee"
                },
                "filename": fileObj.filename,
                "integrity": fileObj.integrity,
                "size": fileObj.size,
                "exec": true,
                "execConfig": {
                  "maxTime": 2
                }
            },
            "destPath": testDir
        }
    }
    deviceStateManager.__setState('desired', `assets.${testAssetID2}`, assetObj)

    deviceStateManager._notifyStateChange('desired', 'assets')
    await dummyAgent.sleep(3000)

    result = await dummyAgent.waitReported(reportedTimeout)
    expect(result).toBe('deployed');
  
    isExist;
    try {
      fs.statSync(path.resolve(__dirname, `./assets/${testDir}/${useTestFile}`));
      isExist = true;
    } catch(err) {
      isExist = false;
    }

    expect(isExist).toBe(true)
  });

  test('Composite Test - boot process (Asset is not saved)', async () => {

    const deviceStateManager = dummyAgent.deviceStateManager()
    const assetManager = dummyAgent.assetManager()

    let useTestFile = 'no-exec-file.txt'
    let testDir = 'testDir'
    let fileObj = await getFileObj(useTestFile)
    deviceStateManager.__defaultState('desired')
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.filename`, fileObj.filename)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.integrity`, fileObj.integrity)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.size`, fileObj.size)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.destPath`, testDir)

    await assetManager.setup()
    assetManager.activate(true)

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
  
  test('Composite Test - boot process (Asset is already saved)', async () => {

    const deviceStateManager = dummyAgent.deviceStateManager()
    const assetManager = dummyAgent.assetManager()


    let useTestFile = 'no-exec-file.txt'
    let testDir = 'testDir'
    let fileObj = await getFileObj(useTestFile)
    deviceStateManager.__defaultState('desired')
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.filename`, fileObj.filename)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.integrity`, fileObj.integrity)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.fileTypeConfig.size`, fileObj.size)
    deviceStateManager.__setState('desired', `assets.${testAssetID}.config.destPath`, testDir)

    let srcPath = path.resolve(__dirname, './data/.enebular-assets.json')
    let dstPath = path.resolve(__dirname, '.enebular-assets.json')
    fs.copyFileSync(srcPath, dstPath);
    
    let destDir = path.resolve(__dirname, './assets/testDir')
    mkdirp.sync(destDir)
    srcPath = path.resolve(__dirname, './data/no-exec-file.txt')
    dstPath = destDir + '/no-exec-file.txt'
    fs.copyFileSync(srcPath, dstPath);

    await assetManager.setup()
    assetManager.activate(true)

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
});
