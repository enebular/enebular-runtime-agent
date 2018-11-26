module.exports = function (RED) {
    function TSL2561Node(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        this.on('input', function (msg) {
            msg.payload = 50;
            node.send(msg);
        });
    }
    RED.nodes.registerType('TSL2561', TSL2561Node);
};