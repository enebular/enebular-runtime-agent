module.exports = function(RED) {
    function digitaloutNode(config) {
        RED.nodes.createNode(this,config);
        var node = this;
        this.on('input', function(msg) {

            if(config.value === 'false'){
                this.status({fill:'blue',shape:'ring',text:config.pinName + ' is false'});
            }else if(config.value === 'true'){
                this.status({fill:'blue',shape:'dot',text:config.pinName + ' is true'});
            }else{
                if(msg[config.pinName]){
                    if(msg[config.pinName] === false || msg[config.pinName] === 'false'){
                        this.status({fill:'blue',shape:'ring',text:config.pinName + ' is false'});
                    }else if(msg[config.pinName] === true || msg[config.pinName] === 'true'){
                        this.status({fill:'blue',shape:'dot',text:config.pinName + ' is true'});
                    }else{
                        this.status({fill:'gray',shape:'dot',text:config.pinName + ' is unknown'});
                    }
                }else{
                    this.status({fill:'gray',shape:'dot',text:config.pinName + ' is unknown'});
                }
            }

            node.send(msg);
        });
    }
    RED.nodes.registerType('digitalout',digitaloutNode);
};