import { Migration } from '../migrator'
import Copy from './copy'
import AwsiotConfigCopy from './awsiot-config-copy'
import NodeJSChange from './nodejs-change'
import RunAsRoot from './run-as-root'
import RemoveExtraUser from './remove-extra-user'

export default class Helper {
  public static addFileCopy(
    migration: Migration,
    desc: string,
    src: string,
    dst: string,
    optional = false
  ): void {
    migration.push(new Copy(desc, src, dst, optional))
  }

  public static addAWSIoTConfigFileCopy(
    migration: Migration,
    src: string,
    dst: string,
    optional = false
  ): void {
    migration.push(
      new AwsiotConfigCopy('AWSIoT config files', src, dst, optional)
    )
  }

  public static addNodeJSChange(
    migration: Migration,
    fromVersion: string,
    toVersion: string
  ): void {
    migration.push(
      new NodeJSChange(
        `nodejs ${fromVersion} => ${toVersion}`,
        fromVersion,
        toVersion
      )
    )
  }

  public static addRunAsRoot(
    migration: Migration,
  ): void {
    migration.push(
      new RunAsRoot(
        `run enebular-agent as root`,
      )
    )
  }

  public static addRemoveExtraUser(
    migration: Migration,
  ): void {
    migration.push(
      new RemoveExtraUser(
        `remove extra --user in config file`,
      )
    )
  }
}
