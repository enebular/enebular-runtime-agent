const fs = require('fs')
const path = require('path')

module.exports = {
  userDir: __dirname,
  flowFile: 'flows.json',
  // logging: {
  //   console: {
  //       level: "info",
  //       metrics: false,
  //       audit: false
  //   },
  //   logstash: {
  //       level:'info',
  //       metrics:true,
  //       handler: function(conf) {
  //           return function(msg) {
  //               try {
  //                 if (msg.msg || msg.msg && msg.type) {
  //                   delete msg['level']
  //                   fs.appendFile(path.resolve(__dirname, './../../ports/' ) + , JSON.stringify(msg)+"\n", function (err) {
  //                     if (err) throw err;
  //                   }); 
  //                 }
  //               }catch(err) { console.log(err);}
  //           }
  //       }
  //   }
  // }
};


