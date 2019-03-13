import * as path from 'path'
import * as fs from 'fs'

import { CopyMigration, CopyState } from './copy-migration'
import Migrator from '../migrator'
import Utils from '../utils'

export default class AwsiotConfigMigration extends CopyMigration {
  public constructor(name: string, copyFrom: string, copyTo: string) {
    super(name, copyFrom, copyTo, false)
  }

  public async do(migrator: Migrator): Promise<void> {
    const awsiotConfigPath = path.resolve(
      (this._currentState as CopyState).path,
      this._name
    )
    const awsiotConfig = JSON.parse(fs.readFileSync(awsiotConfigPath, 'utf8'))

    // TODO: check isAbsolute path
    const filesToCopy = [
      this._name,
      awsiotConfig.caCert,
      awsiotConfig.clientCert,
      awsiotConfig.privateKey
    ]

    let promises: Promise<void>[] = []
    filesToCopy.forEach(file => {
      promises.push(
        Utils.copy(
          migrator.log,
          path.resolve((this._currentState as CopyState).path, file),
          path.resolve((this._desiredState as CopyState).path, file),
          migrator.userInfo
        )
      )
    })
    await Promise.all(promises)
  }
}
