import * as path from 'path'
import * as fs from 'fs'

import { ContextDependCopy } from './context-depend-copy'
import { CopyState } from './copy'
import { MigrateContext } from '../migrator'
import Utils from '../utils'

export default class AwsiotConfigMigration extends ContextDependCopy {
  public constructor(
    name: string,
    pathFunc: (context: MigrateContext, copyOps: ContextDependCopy) => void,
    optional = false
  ) {
    super(name, pathFunc, optional)
  }

  public async do(context: MigrateContext): Promise<void> {
    this._updatePathCallback(context, this)
    const awsiotConfigPath = (this.currentState as CopyState).path
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
          context.log,
          path.resolve(
            path.dirname((this._currentState as CopyState).path),
            file
          ),
          path.resolve(
            path.dirname((this._desiredState as CopyState).path),
            file
          ),
          context.userInfo
        )
      )
    })
    await Promise.all(promises)
  }
}
