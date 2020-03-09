import DeviceStateManager from '../../src/device-state-manager'
import objectPath from 'object-path'

const testUpdateID = 'd8b121b9-dd3e-4deb-9df5-b052891f6cc5'
const testKey = '8fd1e77a-b8d1-4c5b-b084-ede655daabd0'

export default class DeviceStateManagerMock extends DeviceStateManager {
    desired = {}
    reported = {}
    status = {}

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

    __defaultState (type) {
      switch (type) {
        case 'desired':
          let defaultDesiredAssets = { 
            assets: {
                "5b6aef66-909e-4ae8-8174-ab140c372935" : {
                    "updateId": testUpdateID,
                    "ts": 1582791873608,
                    "config": {
                        "name": "file-deploy-test",
                        "type": "file",
                        "fileTypeConfig": {
                            "src": "internal",
                            "internalSrcConfig": {
                                "stored": true,
                                "key": testKey
                            },
                            "filename": "",
                            "integrity": "",
                            "size": 0
                        },
                        "destPath": ""
                    }
                }
            } 
          }
          this.desired = defaultDesiredAssets
          break;
        case 'reported':
          let defaultReportedAssets = {
            assets: {
                assets: {
                    "5b6aef66-909e-4ae8-8174-ab140c372935": {
                        "updateId": "",
                        "state": "",
                        "config": {
                          "name": "",
                          "type": "",
                          "fileTypeConfig": {
                            "integrity": "",
                            "internalSrcConfig": {
                              "key": "",
                              "stored": true
                            },
                            "filename": "",
                            "size": 0,
                            "src": ""
                          },
                          "destPath": ""
                        },
                        "ts": 0
                    }
                }
            }
          }
          this.reported = defaultReportedAssets
          break;
        case 'state':
          let defaultStatusAssets = {}
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
  