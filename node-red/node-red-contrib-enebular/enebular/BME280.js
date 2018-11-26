module.exports = function (RED) {
    function BME280Node(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        this.on('input', function (msg) {
            msg.payload = {
                "temperature": 20,
                "humidity": 30,
                "atmPressure": 1013
            };
            node.send(msg);
        });
    }
    RED.nodes.registerType('BME280', BME280Node);
};