import objectPath from 'object-path'
import Utils from './utils'

export default class DummyCtrlMsgHandler {
  _flowAssetsId: string
  _flowUpdateId: string
  _flowURL: string
  _updateRequests: Array
  _reportedStates: Object
  flowURLAttemptCount =  0
  flowURLTimeout = false
  ctrlMsgRequestTimeout = false

  constructor() {
    this._updateRequests = []
    this._reportedStates = {}
  }

  setFlow(assetId, updateId) {
    this._flowAssetsId = assetId
    this._flowUpdateId = updateId
  }

  setFlowURL(url) {
    this._flowURL = url
  }

  getReportedStates() {
    return this._reportedStates
  }

  getUpdateRequest() {
    return this._updateRequests
  }

  ctrlMsgCallback(connector, msg) {
    if (this.ctrlMsgRequestTimeout)
      return
    let deviceStates = Utils.getEmptyDeviceState()
    if (msg.topic == 'deviceState/device/get') {
      const rawDesiredState = {}
      if (this._flowAssetsId) {
        objectPath.set(rawDesiredState, 'flow.flow', {
            assetId: this._flowAssetsId,
            updateId: this._flowUpdateId
        })
      }
      const desiredState = Utils.getDummyState('desired', rawDesiredState)
      deviceStates[0] = desiredState
      connector.sendCtrlMessage({
        type: 'res',
        id: msg.id,
        res: 'ok',
        body: {
          states: deviceStates
        }
      })
    }
    else if (msg.topic == 'deviceState/device/update') {
      const result = msg.body.updates.map(update => {
        this._updateRequests.push(update)
        if (update.op === 'set') {
          objectPath.set(this._reportedStates, 'state.' + update.path, update.state)
        } else if (update.op === 'remove') {
          objectPath.del(this._reportedStates, 'state.' + update.path)
        }
        return {
          success: true,
          meta: {}
        }
      })
      connector.sendCtrlMessage({
        type: 'res',
        id: msg.id,
        res: 'ok',
        body: {
          updates: result
        }
      })
    }
    else if (msg.topic == 'flow/device/getFlowDataUrl') {
      this.flowURLAttemptCount++
      if (this.flowURLTimeout)
        return
      if (this._flowURL) {
        connector.sendCtrlMessage({
          type: 'res',
          id: msg.id,
          res: 'ok',
          body: {
            url: this._flowURL
          }
        })
      }
      else {
        connector.sendCtrlMessage({
          type: 'res',
          id: msg.id,
          res: 'err',
          body: {
            message: 'error'
          }
        })
      }
    }
  }
}
