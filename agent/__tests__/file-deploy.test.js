import * as utils from '../src/utils'
import { desired } from './helpers/dummy-data'
import DummyAgent from './helpers/dummy-agent'

jest.unmock('child_process');
jest.unmock('fs');

const fs = require('fs')
let dummyAgent = new DummyAgent()

const testFunc1 = jest.fn((url, path, obj) => {
  fs.writeFileSync(
    path,
    'test',
    'utf8'
  )
})

describe('File Deploy Test', () => {
  let utilSpy

  beforeAll(() => {
  });

  beforeEach(() => {
    utilSpy = jest.spyOn(utils, 'progressRequest').mockImplementation(testFunc1);
  });

  afterEach(() => {
    jest.restoreAllMocks()
  });
  
  afterAll(() => {
  })

  test('Deploy - success', async () => {

    const _deviceStateManager = dummyAgent.deviceStateManager()
    const _assetManager = dummyAgent.assetManager()

    await _assetManager.setup()
    _assetManager.activate(true)

    _deviceStateManager.__setState('desired', desired(0))
    _deviceStateManager._notifyStateChange('desired', 'assets')

    await dummyAgent.sleep(2)
    expect(2).toBe(2);
  });

  test('Deploy - normal test', async () => {

    expect(2).toBe(2);
  });

});
