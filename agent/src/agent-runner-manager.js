export default class AgentRunnerManager {

  constructor() {
  }

  _sendRequest(request: Object) {
    if (process.send) {
      process.send(request)
    }
  }

  remoteLogin(settings: Object, signature: string) {
    this._sendRequest({
      type: "remoteLogin",
      settings: settings,
      signature: signature
    })
  }
}



