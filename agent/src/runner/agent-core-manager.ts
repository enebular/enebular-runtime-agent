import { ChildProcess } from 'child_process'
import EventEmitter from 'events'
import { Data, Log, Response, StatusUpdate } from './agent-runner-message-type'

export default class AgentCoreManager extends EventEmitter {
  private _proc?: ChildProcess

  public constructor(proc: ChildProcess) {
    super()
    this._proc = proc
    this._proc.on('message', async msg => {
      this.emit('dataReceived', msg)
    })
  }

  _send(msg: Data) {
    if (this._proc && this._proc.send) {
      this._proc.send(msg)
    }
  }

  public sendResponse(response: Response) {
    return this._send({
      type: 'response',
      body: response
    })
  }

  public sendStatusUpdate(statusUpdate: StatusUpdate) {
    return this._send({
      type: 'statusUpdate',
      body: statusUpdate
    })
  }

  public sendLog(log: Log) {
    return this._send({
      type: 'log',
      body: log
    })
  }
}
