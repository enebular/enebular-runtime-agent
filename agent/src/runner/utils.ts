import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'

export interface PublicKeyInfo {
  id: number
  key: string
  path: string
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
  const filePath = path.resolve(publicKeyPath, id)
  const stat = fs.statSync(filePath)
  if ((stat.mode & 0x1FF) !== 0o600) {
    throw new Error(
      `Public key permission is too open`
    )
  }
  return {
    id: id,
    key: fs.readFileSync(filePath, 'utf8'),
    path: publicKeyPath
  }
}

export function verifySignature(
  data: string,
  pubKey: string,
  signature: string
): void {
  let verified = false
  try {
    const verify = crypto.createVerify('SHA256')
    verify.update(data)
    verified = verify.verify(pubKey, signature, 'base64')
  } catch (err) {
    throw new Error(err.message)
  }

  if (!verified) {
    throw new Error(`Invalid signature`)
  }
}
