/**
 *
 */
'use strict'

var hub = require('./hub')

module.exports = function (RED) {
  function AWSLambdaRequestNode (config) {
    RED.nodes.createNode(this, config)
    var node = this
    console.log('## registering listener to emitter ##')
    hub.on('fire', function (event, context) {
      console.log('# accept lambda event #')
      node.send({ lambdaContext: context, payload: event })
    })
  }
  RED.nodes.registerType('aws-lambda-request', AWSLambdaRequestNode)

  function AWSLambdaResponseNode () {
    var node = this
    this.on('input', function (msg) {
      if (!msg.lambdaContext) {
        node.error('No lambda request')
        return
      }
      console.log('# callback to lambda #')
      msg.lambdaContext.done(null, msg.payload)
    })
  }
  RED.nodes.registerType('aws-lambda-response', AWSLambdaResponseNode)
}
