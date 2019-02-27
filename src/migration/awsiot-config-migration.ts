import * as path from 'path'
import * as fs from 'fs'

import CopyMigration from './copy-migration'
import Migrator from '../migrator'
import Utils from '../utils'

export default class AwsiotConfigMigration extends CopyMigration {
  public constructor(
    name: string,
    copyFrom: string,
    copyTo: string,
    migrator: Migrator
  ) {
    super(name, copyFrom, copyTo, migrator, false)
    this._type = 'copy-awsiot-config'
  }

  public async _do(): Promise<{}> {
    const awsiotConfigPath = path.resolve(this._copyFrom, this._name)
    const awsiotConfig = JSON.parse(fs.readFileSync(awsiotConfigPath, 'utf8'))

    // TODO: check isAbsolute path
    const filesToCopy = [
      this._name,
      awsiotConfig.caCert,
      awsiotConfig.clientCert,
      awsiotConfig.privateKey
    ]

    let promises: Promise<{}>[] = []
    filesToCopy.forEach(file => {
      promises.push(
        Utils.copy(
          this._migrator.log,
          path.resolve(this._copyFrom, file),
          path.resolve(this._copyTo, file),
          this._migrator.userInfo
        )
      )
    })
    return Promise.all(promises)
  }
}
