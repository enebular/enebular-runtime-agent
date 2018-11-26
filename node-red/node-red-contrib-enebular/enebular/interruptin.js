module.exports = function(RED) {
    function interruptinNode(config) {
        RED.nodes.createNode(this,config);
        var node = this;
        this.on('input', function(msg) {
            config.mode = Number(config.mode);
            if (config.trigger === 'rise' || config.trigger === 'fall') {
                msg.payload = (config.trigger === 'rise' ? 'high' : 'low');
                node.send(msg);
            } else {
                node.error('Error: the value of "trigger" property is invalid.');
            }
        });
    }
    RED.nodes.registerType('interruptin',interruptinNode);
};