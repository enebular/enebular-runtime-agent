import * as fs from 'fs'
import * as path from 'path'
import crypto from 'crypto'
import objectHash from 'object-hash'

interface Request {
  type: string
  config: Object
  signature: string
}

export default class AgentRunnerService {

  public constructor() {

  }

  private _debug(...args: any[]): void {
    if (process.env.DEBUG === 'debug') console.info('runner:', ...args)
  }

  private _info(...args: any[]): void {
    console.info(...args)
  }

  private _error(...args: any[]): void {
    console.error(...args)
  }

  public onRequestReceived(request: Request) {
    if (!request.type || !request.config || !request.signature) {
      this._error("Invalid request:", JSON.stringify(request, null, 2))
      return
    }
      
    const hash = objectHash(request.config, { algorithm: 'sha256', encoding: 'base64' })
    this._debug("Config object hash is:", hash)

    const pubKeyPath = path.resolve(__dirname, '../../keys/pubkey.pem')
    const signature = request.signature
    const pubKey = fs.readFileSync(pubKeyPath, 'utf8')
    const verify = crypto.createVerify('SHA256')
    verify.update(hash)
    if (verify.verify(pubKey, signature, 'base64')) {
      this._debug('Signature verified OK')
    } else {
      this._error("Signature verified failed, invalid request", JSON.stringify(request, null, 2))
      return
    }

    switch (request.type) {
      case 'remoteLogin':
        break
      default:
        this._error("unknown request type:", request.type)
        return
    }
  }
}
