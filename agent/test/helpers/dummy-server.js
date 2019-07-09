/* @flow */
import fs from 'fs'
import path from 'path'
import express from 'express'
import EventEmitter from 'events'
import multer from 'multer'
import DummyServerConfig from './dummy-server-config'

let upload = multer()

export default class DummyServer extends EventEmitter {
  _logReturnBadRequest: boolean
  _tmpAssetFilePath: string
  setLogReturnBadRequest(bad) {
    this._logReturnBadRequest = bad
  }

  setTmpAssetFilePath(path) {
    this._tmpAssetFilePath = path
  }

  async start(port = process.env.PORT) {
    const app = express()
    const bodyParser = require('body-parser')
    const server = this
    app.use(bodyParser.urlencoded({ extended: true }))
    app.use(bodyParser.json())
    app.post(DummyServerConfig.activateLicenseURL, (req, res) => {
      console.log('activate license', req.body)
      server.emit('activateLicense', req.body)
      res.send({
        connectionId: 'dummy_connectionId',
        authRequestUrl:
          'http://127.0.0.1:' + port + DummyServerConfig.authenticationURL,
        agentManagerBaseUrl: 'http://127.0.0.1:' + port + '/agent-manager'
      })
    })
    app.post(DummyServerConfig.verifyLicenseURL, (req, res) => {
      // console.log("verify license", req.body);
      server.emit('verifyLicense', req.body)
      res.send({
        canActivate: req.body.licenseKey !== 'invalid_key'
      })
    })
    app.post(DummyServerConfig.authenticationURL, (req, res) => {
      server.emit('authRequest', req.body)
      console.log('auth request', req.body)
      res.status(req.body.connectionId === 'return_bad_request' ? 400 : 200).send({})
    })
    app.post(
      DummyServerConfig.recordLogsURL,
      upload.single('events'),
      (req, res) => {
        // console.log("log:", req.file);
        server.emit('recordLogs', req.file)
        res.status(this._logReturnBadRequest ? 400 : 200).send({})
      }
    )
    app.post(DummyServerConfig.notifyStatusURL, (req, res) => {
      server.emit('notifyStatus', req.body)
      res.status(200).send({})
    })
    app.post(DummyServerConfig.deviceStateGetURL, (req, res) => {
      server.emit('deviceStateGet', req.body)
      if (this.onDeviceStateGet) this.onDeviceStateGet(req, res)
      else res.status(400).send({})
    })
    app.post(DummyServerConfig.deviceStateUpdateURL, (req, res) => {
      server.emit('deviceStateUpdate', req.body)
      if (this.onDeviceStateUpdate) this.onDeviceStateUpdate(req, res)
      else res.status(400).send({})
    })

    app.post(DummyServerConfig.deviceAssetsFileDataURL, (req, res) => {
      res.send({
        url:
          'http://127.0.0.1:' +
          port +
          '/test/download-asset?key=' +
          req.body.key
      })
    })

    app.get(DummyServerConfig.downloadAssetURL, (req, res) => {
      if (this.downloadAssetReturnError) {
        res.status(301).send({})
      } else {
        const assetPath = req.query.key.startsWith('random')
          ? path.join(this._tmpAssetFilePath, req.query.key)
          : path.join(__dirname, '..', 'data', req.query.key)
        console.log(assetPath)
        res.sendFile(assetPath)
      }
    })

    app.get(DummyServerConfig.downloadFlowURL, (req, res) => {
      console.log('download', req.query)
      const flowName = req.query.flow
      const json = fs.readFileSync(
        path.join(__dirname, '..', 'data', flowName),
        'utf8'
      )
      const flow = JSON.parse(json)
      let cred = {}
      const flowCredsPath = path.join(
        __dirname,
        '..',
        'data',
        'creds_of_' + flowName
      )
      if (fs.existsSync(flowCredsPath)) {
        const credJson = fs.readFileSync(flowCredsPath, 'utf8')
        cred = JSON.parse(credJson)
      }
      res.send({
        flows: flow,
        creds: cred,
        packages: req.query.dependencies
          ? { 'node-red-node-pi-gpiod': '0.0.10' }
          : {},
        editSession: req.query.edit 
        ? {
          ipAddress: '0.0.0.0',
          sessionToken: 'token'
        } : {}
      })
    })
    app.get(DummyServerConfig.credsURL, (req, res) => {
      if (req.headers.authorization) {
        const b64auth = (req.headers.authorization || '').split(' ')[1] || ''
        const [login, password] = Buffer.from(b64auth, 'base64')
          .toString()
          .split(':')
        console.log(login)
        console.log(password)
        server.emit('credsCheck', login, password)
      } else {
        server.emit('credsCheck', '', '')
      }
      res.sendStatus(200)
    })
    return new Promise(resolve => {
      const http = app.listen(port, () => {
        resolve(http)
      })
    })
  }
}
