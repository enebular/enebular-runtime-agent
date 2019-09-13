export default class AgentRunnerManager {
  _taskIndex = 1

  constructor() {
    process.on('message', msg => {
      console.log(msg)
    })
  }

  _sendRequest(request: Object) {
    if (process.send) {
      process.send(request)
    }
  }

  remoteLogin(settings: Object, signature: string) {
    this._sendRequest({
      id: this._taskIndex++,
      type: "remoteLogin",
      settings: settings,
      signature: signature
    })
  }
}



