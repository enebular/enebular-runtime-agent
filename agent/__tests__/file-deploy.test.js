import * as utils from '../src/utils'
import DummyAgent from './helpers/dummy-agent'
import {
  deleteDir,
  deleteFile,
  getFileObj
} from './helpers/utils'

jest.unmock('child_process');
jest.unmock('fs');
jest.setTimeout(10000) 

const fs = require('fs')
const path = require('path');

const testFunc1 = jest.fn((url, destPath, obj) => {
  let srcPath = path.resolve(__dirname, './data/TestFile.txt')
  fs.copyFileSync(srcPath, destPath);
})

describe('File Deploy Test', () => {
  let utilSpy
  let dummyAgent

  beforeAll(() => {
  });

  beforeEach(() => {
    dummyAgent = new DummyAgent(__dirname)
    utilSpy = jest.spyOn(utils, 'progressRequest').mockImplementation(testFunc1);
  });

  afterEach(() => {
    jest.restoreAllMocks()
    dummyAgent = null

    deleteFile(path.resolve(__dirname, '.enebular-assets.json'))
    deleteDir(path.resolve(__dirname, './assets'))

  });
  
  afterAll(() => {
  })

  test('Deploy - Success', async () => {

    const _deviceStateManager = dummyAgent.deviceStateManager()
    const _assetManager = dummyAgent.assetManager()

    const fileObj = await getFileObj('TestFile.txt')
    _deviceStateManager.__setState('desired', `assets.11111111-2222-3333-4444-555555555555.config.fileTypeConfig.filename`, fileObj.filename)
    _deviceStateManager.__setState('desired', `assets.11111111-2222-3333-4444-555555555555.config.fileTypeConfig.integrity`, fileObj.integrity)
    _deviceStateManager.__setState('desired', `assets.11111111-2222-3333-4444-555555555555.config.fileTypeConfig.size`, fileObj.size)

    await _assetManager.setup()
    _assetManager.activate(true)

    await dummyAgent.sleep(1)

    _deviceStateManager._notifyStateChange('desired', 'assets')

    let result = await dummyAgent.waitReported(1000)
    expect(result).toBe('deployed');
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
