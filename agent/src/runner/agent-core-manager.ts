import { ChildProcess } from 'child_process'
import EventEmitter from 'events'

export default class AgentCoreManager extends EventEmitter {
  private _proc?: ChildProcess

  public init(proc: ChildProcess) {
    this._proc = proc
    this._proc.on('message', async msg => {
      this.emit('dataReceived', msg)
    })
  }

  _send(msg: Object) {
    if (this._proc && this._proc.send) {
      this._proc.send(msg)
    }
  }

  public sendResponse(response: Object) {
    return this._send({
      type: 'response',
      response: response
    })
  }

  public sendLog(log: string) {
    return this._send({
      type: 'log',
      log: log
    })
  }
}
