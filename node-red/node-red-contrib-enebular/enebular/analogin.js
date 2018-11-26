module.exports = function(RED) {
    function analoginNode(config) {
        RED.nodes.createNode(this,config);
        var node = this;
        this.on('input', function(msg) {
            msg.topic = config.pinName;
            if(config.valueType === 'float'){
                msg.payload = 1.0000;
                msg.analogin = 1.0000;
            }else if(config.valueType === 'int'){
                msg.payload = 0xFFFF;
                msg.analogin = 0xFFFF;
            }else if(config.valueType === 'voltage'){
                msg.payload = 3.3000;
                msg.analogin = 3.3000;
            }
            node.send(msg);
        });
    }
    RED.nodes.registerType('analogin',analoginNode);
};