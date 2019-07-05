module.exports = function(RED) {
  function main(config) {
    RED.nodes.createNode(this, config)
    var node = this
    this.on('input', function() {
      node.status({
        fill: 'red',
        shape: 'ring',
        text: 'no ai model'
      })
      node.error('Upload AI Model first to use enebular AI node')
    })
  }
  RED.nodes.registerType('enebular-ai-node', main)
}
