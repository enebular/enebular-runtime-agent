import DeviceStateManager from '../../src/device-state-manager'
import objectPath from 'object-path'

export default class DeviceStateManagerMock extends DeviceStateManager {
    desired = {}
    reported = {}
    status = {}

    __setState (type, state) {
      switch (type) {
        case 'desired':
          this.desired = state
          break;
        case 'reported':
          this.reported = state
          break;
        case 'state':
          this.status = state
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
  