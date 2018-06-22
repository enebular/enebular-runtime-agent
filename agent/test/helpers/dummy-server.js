import fs from 'fs'
import path from 'path'

import express from 'express'
import EventEmitter from 'events'

/**
 *
 */
export default class DummyServer extends EventEmitter {
  async start(port = process.env.PORT) {
    const app = express()
    const bodyParser = require('body-parser');
    const server = this
    app.use(bodyParser.json());
    app.post('/api/v1/activate-license', (req, res) => {
      console.log("activate license", req.body);
      server.emit("activateLicense", req.body)
      res.send({
        connectionId: "dummy_connectionId",
        authRequestUrl: "http://127.0.0.1:3001/api/v1/token/device",
        agentManagerBaseUrl: "http://127.0.0.1:3001/api/v1"
      })
    })
    app.post('/api/v1/verify-license', (req, res) => {
      // console.log("verify license", req.body);
      server.emit("verifyLicense", req.body)
      res.send({canActivate: req.body.licenseKey === "invalid_key" ? false: true})
    })
    app.post('/api/v1/token/device', (req, res) => {
      server.emit("authRequest", req.body)
      console.log("auth request", req.body);
      res.sendStatus(req.body.connectionId === "return_bad_request" ? 400 : 200)
    })
    app.post('/api/v1/record-logs', (req, res) => {
      server.emit("recordLogs", req.body)
      res.sendStatus(200)
    })
    app.post('/api/v1/notify-status', (req, res) => {
      server.emit("notifyStatus", req.body)
      res.sendStatus(200)
    })
    app.get('/download', (req, res) => {
      console.log("download", req.query);
      const flowName = req.query.flow
      const json = fs.readFileSync(path.join(__dirname, "..", "data", flowName), 'utf8')
      const flow = JSON.parse(json)
      res.send({
        flows: flow,
        creds: [],
        packages: req.query.dependencies ? {"node-red-node-pi-gpiod": "0.0.10"} : {}
      })
    })
    return new Promise(resolve => {
      const http = app.listen(port, () => {
        resolve(http)
      })
    })
  }
}
