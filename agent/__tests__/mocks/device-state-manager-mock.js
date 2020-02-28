import DeviceStateManager from '../../src/device-state-manager'

export default class DeviceStateManagerMock extends DeviceStateManager {
    desiredPath = {}
    reportedPath = {}
    statePath = {}

    desired = {}
    reported = {}
    status = {}

    __setPath (type, path) {
        switch (type) {
          case 'desired':
            this.desiredPath = path
            break;
          case 'reported':
            this.reportedPath = path
            break;
          case 'state':
            this.statePath = path
            break;
          default:
            break;
        }
    }

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
}
  