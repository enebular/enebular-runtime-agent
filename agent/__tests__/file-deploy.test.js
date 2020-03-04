import * as utils from '../src/utils'
import { 
  desired,
  reported
} from './helpers/dummy-data'
import DummyAgent from './helpers/dummy-agent'

jest.unmock('child_process');
jest.unmock('fs');
jest.setTimeout(10000) 

const fs = require('fs')
const path = require('path');

const testFunc1 = jest.fn((url, path, obj) => {
  fs.writeFileSync(
    path,
    'test',
    'utf8'
  )
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
    try {
      let assetPath = path.resolve(__dirname, '.enebular-assets.json')
      fs.statSync(assetPath)
      fs.unlinkSync(assetPath)
    } catch (error) {
    }

  });
  
  afterAll(() => {
  })

  test('Deploy - Success', async () => {

    const _deviceStateManager = dummyAgent.deviceStateManager()
    const _assetManager = dummyAgent.assetManager()

    await _assetManager.setup()
    _assetManager.activate(true)

    await dummyAgent.sleep(1)

    _deviceStateManager.__setState('desired', desired(0))
    _deviceStateManager.__setState('reported', reported(0))

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

    _deviceStateManager.__setState('desired', desired(0))
    _deviceStateManager.__setState('reported', reported(0))

    _deviceStateManager._notifyStateChange('desired', 'assets')

    let result = await dummyAgent.waitReported(1000)
    expect(result).toBe('timeout');
  });

});
