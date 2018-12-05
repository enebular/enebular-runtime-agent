module.exports = function (RED) {
  var MilkCocoa = require('milkcocoa')

  function MilkcocoaNode (n) {
    RED.nodes.createNode(this, n)
  }

  RED.nodes.registerType('enebular credential', MilkcocoaNode, {
    credentials: {
      appId: { type: 'text' },
      apiKey: { type: 'text' },
      apiSecret: { type: 'password' }
    }
  })

  var url = 'https://enebular.com'

  function EnebularNode (n) {
    url = n.url
    RED.nodes.createNode(this, n)
    this.milkcocoa = n.milkcocoa
    this.dataStore = n.dataStore
    this.operation = n.operation
    this.targetId = n.targetId
    this.milkcocoaConfig = RED.nodes.getNode(this.milkcocoa)
    if (this.milkcocoaConfig) {
      var node = this
      var milkcocoa
      var credentials = RED.nodes.getCredentials(this.milkcocoa)
      if (credentials.apiKey && credentials.apiSecret) {
        milkcocoa = MilkCocoa.connectWithApiKey(credentials.appId + '.mlkcca.com', credentials.apiKey, credentials.apiSecret)
      } else {
        milkcocoa = new MilkCocoa(credentials.appId + '.mlkcca.com')
      }
      this.on('input', function (msg) {
        node.sendMsg = function (err, result) {
          if (err) {
            node.error(err.toString())
            node.status({ fill: 'red', shape: 'ring', text: 'failed' })
          } else {
            node.status({})
          }
          msg.payload = result
          node.send(msg)
        }
        var targetId = msg.targetId || node.targetId
        var ds = milkcocoa.dataStore(node.dataStore)
        var payload = typeof msg.payload === 'string' ? JSON.parse(msg.payload) : msg.payload
        switch (node.operation) {
          case 'push':
            ds.push(payload, node.sendMsg)
            break
          case 'send':
            ds.send(payload, node.sendMsg)
            break
          case 'set':
            ds.set(targetId, payload, node.sendMsg)
            break
          case 'remove':
            ds.remove(targetId, node.sendMsg)
            break
        };
      })
    }
  }
  RED.httpAdmin.get('/enebular/url', function (req, res) {
    res.json({url: url})
  })
  RED.nodes.registerType('enebular', EnebularNode)
}
