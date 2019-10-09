import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'

export interface PublicKeyInfo {
  id: number
  key: string
}

export function getPublicKey(): PublicKeyInfo {
  const publicKeyPath = path.resolve(__dirname, '../../keys/enebular')
  if (!fs.existsSync(publicKeyPath)) {
    throw new Error(`Failed to find public key directory`)
  }
  let filenames
  try {
    filenames = fs.readdirSync(publicKeyPath)
  } catch (err) {
    throw new Error(
      `Failed to get public key directory content: ${err.message}`
    )
  }

  if (filenames.length !== 1) {
    throw new Error(`Failed to locate public key`)
  }

  const id = filenames[0]
  return {
    id: id,
    key: fs.readFileSync(path.resolve(publicKeyPath, id), 'utf8')
  }
}

export function verifySignature(data: string, pubKey: string, signature: string) {
  const verify = crypto.createVerify('SHA256')
  verify.update(data)
  return verify.verify(pubKey, signature, 'base64')
}




