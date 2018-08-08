/* @flow */
import ThingCreator from './thing-creator'
import type { ThingCreatorConfig } from './thing-creator'

const config: ThingCreatorConfig = {
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  awsIotRegion: process.env.AWS_IOT_REGION
} 

async function main() {
  const creator = new ThingCreator(config)
  return await creator.createThing(
    process.env.AWS_IOT_CONFIG_SAVE_PATH,
    process.env.AWS_IOT_THING_NAME
  ).catch((err) => {
    console.log(err)
    throw('failed to create thing.')
  })
}

if (require.main === module) {
  main().catch(()=> {
    process.exit(1)
  })
}

export { main }

