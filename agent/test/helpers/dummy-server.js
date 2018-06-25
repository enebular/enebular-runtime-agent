/* @flow */
import fs from 'fs'
import path from 'path'
import express from 'express'
import EventEmitter from 'events'
import multer from 'multer'

let upload = multer()

export default class DummyServer extends EventEmitter {
  _logReturnBadRequest: boolean
  setLogReturnBadRequest(bad) {
    this._logReturnBadRequest = bad
  }

  async start(port = process.env.PORT) {
    const app = express()
    const bodyParser = require('body-parser')
    const server = this
    app.use(bodyParser.urlencoded({ extended: true }))
    app.use(bodyParser.json())
    app.post('/api/v1/activate-license', (req, res) => {
      console.log('activate license', req.body)
      server.emit('activateLicense', req.body)
      res.send({
        connectionId: 'dummy_connectionId',
        authRequestUrl: 'http://127.0.0.1:3001/api/v1/token/device',
        agentManagerBaseUrl: 'http://127.0.0.1:3001/api/v1'
      })
    })
    app.post('/api/v1/verify-license', (req, res) => {
      // console.log("verify license", req.body);
      server.emit('verifyLicense', req.body)
      res.send({
        canActivate: req.body.licenseKey !== 'invalid_key'
      })
    })
    app.post('/api/v1/token/device', (req, res) => {
      server.emit('authRequest', req.body)
      console.log('auth request', req.body)
      res.sendStatus(req.body.connectionId === 'return_bad_request' ? 400 : 200)
    })
    app.post('/api/v1/record-logs', upload.single('events'), (req, res) => {
      // console.log("log:", req.file);
      server.emit('recordLogs', req.file)
      res.sendStatus(this._logReturnBadRequest ? 400 : 200)
    })
    app.post('/api/v1/notify-status', (req, res) => {
      server.emit('notifyStatus', req.body)
      res.sendStatus(200)
    })
    app.get('/download', (req, res) => {
      console.log('download', req.query)
      const flowName = req.query.flow
      const json = fs.readFileSync(
        path.join(__dirname, '..', 'data', flowName),
        'utf8'
      )
      const flow = JSON.parse(json)
      res.send({
        flows: flow,
        creds: [],
        packages: req.query.dependencies
          ? { 'node-red-node-pi-gpiod': '0.0.10' }
          : {}
      })
    })
    return new Promise(resolve => {
      const http = app.listen(port, () => {
        resolve(http)
      })
    })
  }
}
