import express from 'express'
import EventEmitter from 'events'

/**
 *
 */
export default class Server extends EventEmitter {
  async start(port = process.env.PORT) {
    const app = express()
    const bodyParser = require('body-parser');
    let server = this
    app.use(bodyParser.json());
    app.post('/api/v1/token/device', (req, res) => {
      server.emit("authRequest", req.body)
      // console.log("auth request", req.body);
      res.sendStatus(200)
    })
    app.post('/api/v1/record-logs', (req, res) => {
      server.emit("recordLogs", req.body)
      res.sendStatus(200)
    })

    app.post('/api/v1/notify-status', (req, res) => {
      server.emit("notifyStatus", req.body)
      res.sendStatus(200)
    })
    return new Promise(resolve => {
      app.listen(port, () => {
        resolve(app)
      })
    })
  }
}
