import fs from 'fs';
import AWS from 'aws-sdk';
import promisify from 'es6-promisify';
import S3Store from 'enebular-package-store/s3';


function getAWSConfig() {
  return {
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
    awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  };
}

function getAWSIoTConfig(config) {
  return Object.assign({}, getAWSConfig(), {
    region: process.env.AWS_IOT_REGION,
  });
}

function getAWSIotDataConfig() {
  return Object.assign({}, getAWSIoTConfig(), {
    endpoint: process.env.AWS_IOT_ENDPOINT,
  });
}


function getS3Config() {
  return Object.assign({}, getAWSConfig(), {
    s3BucketName: process.env.S3_BUCKET_NAME,
    s3BaseKey: process.env.S3_BASE_KEY,
  });
}

const iot = new AWS.Iot(getAWSIoTConfig());
const iotdata = new AWS.IotData(getAWSIotDataConfig());
const listThings = promisify(iot.listThings, iot);
const getThingShadow = promisify(iotdata.getThingShadow, iotdata);
const updateThingShadow = promisify(iotdata.updateThingShadow, iotdata);

async function list() {
  const ret = await listThings();
  return Promise.all(
    ret.things.map(async (thing) => {
      const shadow = await getThingShadow({ thingName: thing.thingName })
      return Object.assign({}, thing, { payload: JSON.parse(shadow.payload) });
    })
  );
}

async function notify(thingName, msg) {
  const desired =
    msg.action === 'update-flow' ? { 'package': msg.parameters } :
    msg.action === 'shutdown' ? { power: 'on' } :
    msg.action === 'restart' ? { power: 'off' } :
    undefined;
  if (desired) {
    return updateThingShadow({ thingName, payload: JSON.stringify({ state: { desired }})});
  }
}

async function createUpdateFlowMessageParameters(flowFile, credFile, packagesFile) {
  const params = {};
  if (flowFile) {
    params.flows = JSON.parse(fs.readFileSync(flowFile));
  }
  if (credFile) {
    params.creds = JSON.parse(fs.readFileSync(credFile));
  }
  if (packagesFile) {
    params.packages = JSON.parse(fs.readFileSync(packagesFile));
  }
  console.log('uploading flow package', params);
  const store = new S3Store(getS3Config());
  const downloadUrl = await store.createPackage(params);
  return { downloadUrl };
}

async function main() {
  const command = process.argv[2] || 'list';
  switch(command) {
    case 'list':
      console.log(await list());
      break;
    case 'notify':
      const thingName = process.argv[3];
      const action = process.argv[4];
      let parameters;
      switch (action) {
        case 'update-flow':
          const flowFile = process.argv[5];
          const credFile = process.argv[6];
          const packagesFile = process.argv[7];
          parameters = await createUpdateFlowMessageParameters(flowFile, credFile, packagesFile);
          break;
        default:
          parameters = {};
          break;
      }
      const msg = { action, parameters };
      console.log(await notify(thingName, msg));
      break;
    default:
      console.error('No such command available: ', command);
      break;
  }
}

if (require.main === module) {
  main();
}
