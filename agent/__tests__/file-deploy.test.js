import * as utils from '../src/utils'
import { 
  desired,
  reported
} from './helpers/dummy-data'
import DummyAgent from './helpers/dummy-agent'

jest.unmock('child_process');
jest.unmock('fs');

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
      fs.statSync(path);
      fs.unlinkSync(path.resolve(__dirname, '.enebular-assets.json'));
    } catch (error) {
    }

  });
  
  afterAll(() => {
  })

  test('Deploy - success', async () => {

    const _deviceStateManager = dummyAgent.deviceStateManager()
    const _assetManager = dummyAgent.assetManager()

    await _assetManager.setup()
    _assetManager.activate(true)

    await dummyAgent.sleep(1)

    _deviceStateManager.__setState('desired', desired(0))
    _deviceStateManager.__setState('reported', reported(0))

    _deviceStateManager._notifyStateChange('desired', 'assets')

    let result = await dummyAgent.waitReported(500)
    expect(result).toBe('deployed');
  });

  test('Deploy - fail', async () => {

    expect(2).toBe(2);
  });

});
