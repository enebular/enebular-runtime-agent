import ThingFactory from './thing-factory'

const creator = new ThingFactory({
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  awsIotRegion: process.env.AWS_IOT_REGION
})

async function main() {
  const ret = await creator.createAWSIoTThing(
    process.env.AWS_IOT_CONFIG_SAVE_PATH,
    process.env.AWS_IOT_THING_NAME
  )
  process.exit(ret ? 0 : 1)
}

if (require.main === module) {
  main()
}
