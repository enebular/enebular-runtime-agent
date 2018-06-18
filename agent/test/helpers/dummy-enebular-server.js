import express from 'express'
import EventEmitter from 'events'

/**
 *
 */
export default class Server extends EventEmitter {
  async start(port = process.env.PORT) {
    const app = express()
    const bodyParser = require('body-parser');
    app.use(bodyParser.json());
    app.post('/api/v1/token/device', (req, res) => {
      console.log("auth request", req.body);
      this.emit("auth-request", {})
      res.send({ })
    })
    return new Promise(resolve => {
      app.listen(port, () => {
        resolve(app)
      })
    })
  }
}
