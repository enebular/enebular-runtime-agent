type Data = {
  type: string,
  body: Request
}

type Request = {
  id: number,
  type: string,
  settings: Object
}

export default class AgentRunnerManager {
  _taskIndex = 1

  constructor() {
    process.on('message', msg => {
      console.log(msg)
    })
  }

  _send(data: Data) {
    if (process.send) {
      process.send(data)
    }
  }

  _sendRequest(request: Object) {
    this._send({
      type: 'request',
      body: request
    })
  }

  remoteLogin(settings: Object) {
    this._sendRequest({
      id: this._taskIndex++,
      type: "remoteLogin",
      settings: settings
    })
  }
}

