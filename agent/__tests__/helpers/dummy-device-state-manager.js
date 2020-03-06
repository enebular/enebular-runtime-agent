import DeviceStateManager from '../../src/device-state-manager'
import objectPath from 'object-path'

let defaultDesiredAssets = { 
  assets: {
      "11111111-2222-3333-4444-555555555555" : {
          "updateId": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          "ts": 1582791873608,
          "config": {
              "name": "file-deploy-test",
              "type": "file",
              "fileTypeConfig": {
                  "src": "internal",
                  "internalSrcConfig": {
                  "stored": true,
                  "key": "8fd1e77a-b8d1-4c5b-b084-ede655daabd0"
                  },
                  "filename": "test.txt",
                  "integrity": "n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg=",
                  "size": 4
          },
          "destPath": "test_dir"
          }
      }
  } 
}

let defaultReportedAssets = {
  assets: {
      assets: {
          "11111111-2222-3333-4444-555555555555": {
              "updateId": "0f0c14af-5c9f-4831-8018-05dfc739472c",
              "state": "deployed",
              "config": {
                "name": "file-test-hara2",
                "type": "file",
                "fileTypeConfig": {
                  "integrity": "n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg=",
                  "internalSrcConfig": {
                    "key": "8fd1e77a-b8d1-4c5b-b084-ede655daabd0",
                    "stored": true
                  },
                  "filename": "test_hara2.txt.txt",
                  "size": 4,
                  "src": "internal"
                },
                "destPath": "test_hara"
              },
              "ts": 1583230604886
          }
      }
  }
}

let defaultStatusAssets = {}

export default class DeviceStateManagerMock extends DeviceStateManager {
    desired = defaultDesiredAssets
    reported = defaultReportedAssets
    status = defaultStatusAssets

    __setState (type, path, state) {
      switch (type) {
        case 'desired':
          objectPath.set(this.desired, path, state)
          break;
        case 'reported':
          objectPath.set(this.reported, path, state)
          break;
        case 'state':
          objectPath.set(this.status, path, state)
          break;
        default:
          break;
      }
    }

    getState(type, path) {
        switch (type) {
          case 'desired':
            return this.desired
          case 'reported':
            return this.reported
          case 'state':
            return this.status
          default:
            return {}
        }
    }

    __clearState (type) {
      switch (type) {
        case 'desired':
          this.desired = defaultDesiredAssets
          break;
        case 'reported':
          this.reported = defaultReportedAssets
          break;
        case 'state':
          this.status = defaultStatusAssets
          break;
        default:
          break;
      }
    }

    canUpdateState(type) {
      return true
    }

    updateState(type, op, path, state, extRef) {
      /*
      console.log('============= update reported ===========')
      console.log('type:' + type)
      console.log('op:' + op)
      console.log('path:' + path)
      if(state !== undefined) {
        console.log('state: ' + JSON.stringify(state, null, 2))
      }
      */
      objectPath.set(this.reported, path, state)
  }
}
  