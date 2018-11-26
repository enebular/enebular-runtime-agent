var htmlspecialchars = require('htmlspecialchars')

var not_include_list = [
  'node-red',
  'node-red-node-aws-lambda-io',
  'node-red-contrib-enebular'
]

module.exports = function(RED) {
  console.log('##### enebular deploy ####')
  var ENEBULAR_URL = process.env.ISSUER || 'https://enebular.com'
  var projectId = process.env.PROJECT_ID
  var flowId = process.env.FLOW_ID

  RED.httpAdmin.post('/enebular/deploy', function(req, res) {
    var deployPostUrl = `${ENEBULAR_URL}/deploy/${projectId}/flow/${flowId}`
    res.redirect(deployPostUrl)
  })
}
