import DeviceStateManager from '../../src/device-state-manager'

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
}
  