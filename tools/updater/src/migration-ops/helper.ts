import { Migration } from '../migrator'
import Copy from './copy'
import AwsiotConfigCopy from './awsiot-config-copy'
import NodeJSChange from './nodejs-change'

export default class Helper {
  public static KEY_ENEBULAR_CONFIG = 'enebular_agent_config'
  public static KEY_NODE_RED_DATA = 'node-red_data'
  public static KEY_ASSETS_CONFIG = 'assets_config'
  public static KEY_ASSETS_DATA = 'assets_data'
  public static KEY_AWSIOT_CONFIG = 'awsiot_config'
  public static KEY_NODE_JS_CHANGE = 'change_nodejs_version'

  public static addFileCopy(
    migration: Migration,
    key: string,
    desc: string,
    src: string,
    dst: string,
    optional = false
  ): void {
    migration[key] = new Copy(desc, src, dst, optional)
  }

  public static addAWSIoTConfigFileCopy(
    migration: Migration,
    src: string,
    dst: string
  ): void {
    migration[Helper.KEY_AWSIOT_CONFIG] = new AwsiotConfigCopy(
      'AWSIoT config files',
      src,
      dst
    )
  }

  public static addNodeJSChange(
    migration: Migration,
    fromVersion: string,
    toVersion: string
  ): void {
    migration[Helper.KEY_NODE_JS_CHANGE] = new NodeJSChange(
      `nodejs ${fromVersion} => ${toVersion}`,
      fromVersion,
      toVersion
    )
  }
}
