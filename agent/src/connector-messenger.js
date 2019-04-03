/* @flow */
import EventEmitter from 'events'

export default class ConnectorMessenger extends EventEmitter {
  _id: number = 0

  sendMessage(topic: string, body: Object) {
    this.emit(
      'requestConnectorCtrlMessageSend',
      JSON.stringify({
        topic: topic,
        id: this._id,
        // try: 0,
        body: body
      })
    )
    this._id++
  }
}
