import * as path from 'path'
import * as fs from 'fs'

import { CopyState, Copy } from './copy'
import { MigrateContext } from '../migrator'
import Utils from '../utils'

export default class AwsiotConfigCopy extends Copy {
  public constructor(name: string, copyFrom: string, copyTo: string) {
    super(name, copyFrom, copyTo, false)
  }

  private _ensureAbsolutePath(pathToCheck: string, configFilePath: string): string {
    return path.isAbsolute(pathToCheck)
      ? pathToCheck
      : path.resolve(path.dirname(configFilePath), pathToCheck)
  }

  public async do(context: MigrateContext): Promise<void> {
    const awsiotConfigPath = (this.currentState as CopyState).path
    const awsiotConfig = JSON.parse(fs.readFileSync(awsiotConfigPath, 'utf8'))
    const filesToCopy = [
      awsiotConfigPath,
      this._ensureAbsolutePath(awsiotConfig.caCert, awsiotConfigPath),
      this._ensureAbsolutePath(awsiotConfig.clientCert, awsiotConfigPath),
      this._ensureAbsolutePath(awsiotConfig.privateKey, awsiotConfigPath)
    ]

    let promises: Promise<void>[] = []
    filesToCopy.forEach(file => {
      if (file.indexOf(context.projectPath) > -1) {
        // inside project source directory, we will copy it to an equivalent in new project source directly.
        const relativePath = path.relative(context.projectPath, file)
        const newFile = path.resolve(
          context.newProjectPath,
          relativePath
        )
        promises.push(
          Utils.copy(
            context.log,
            file,
            newFile,
            context.userInfo
          )
        )
      }
      else {
        // Leave it if it's not inside project source directory.
      }
    })
    await Promise.all(promises)
  }
}
