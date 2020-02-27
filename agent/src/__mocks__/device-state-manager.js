// __mocks__/device-state-manager.js
const deviceStateManager = jest.genMockFromModule('../device-state-manager');

let desiredPath = {}
let reportedpath = {}
let stetePath = {}

function __setPath (type, path) {
  switch (type) {
    case 'desired':
      desiredPath = path
    case 'reported':
      reportedpath = path
    case 'state':
      stetePath = path
    default:
  }
}


function getState(type, path) {
  switch (type) {
    case 'desired':
      return desiredPath
    case 'reported':
      return reportedPath
    case 'state':
      return statePath
    default:
      return {}
  }
}

deviceStateManager.__setPath = __setPath
deviceStateManager.getState = getState

module.exports = deviceStateManager