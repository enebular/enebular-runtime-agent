import { AWSIoTThingCreator } from '@uhuru/awsiot-thing-creator'
import path from 'path'

const config = {
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  awsIotRegion: process.env.AWS_IOT_REGION,
  configSavePath:
    process.env.AWS_IOT_CONFIG_SAVE_PATH || path.resolve('../../ports/awsiot'),
  thingName: process.env.AWS_IOT_THING_NAME,
  enebularInstallId: process.env.ENEBULAR_INSTALL_ID,
  enebularBaseUrl: process.env.ENEBULAR_BASE_URL
}

async function main() {
  const creator = new AWSIoTThingCreator(config)

  if (config.enebularInstallId) {
    await creator.getConfigFromEnebular().catch(err => {
      console.log(err.message)
      throw new Error('failed to get thing data from enebular.')
    })
  } else {
    await creator.createThingWithCerts().catch(err => {
      console.log(err.message)
      throw new Error('failed to create thing.')
    })
  }
}

if (require.main === module) {
  main().catch(() => {
    process.exit(1)
  })
}

export { main }
