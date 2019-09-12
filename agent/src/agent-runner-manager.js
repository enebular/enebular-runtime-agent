export default class AgentRunnerManager {

  constructor() {
  }

  _sendRequest(request: Object) {
    if (process.send) {
      process.send(request)
    }
  }

  remoteLogin(config: Object, signature: string) {
    this._sendRequest({
      type: "remoteLogin",
      config: config,
      signature: signature
    })
  }
}



