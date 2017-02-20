import fs from 'fs';
import fetch from 'isomorphic-fetch';
import S3Store from 'enebular-package-store/s3';

const MODEINC_API_URL = 'https://api.tinkermode.com';
const { PROJECT_ID, PROJECT_API_KEY, HOME_ID } = process.env;

function createFetchOptions(method = 'GET', body = null, headers = {}) {
  const contentType = body && (typeof body !== 'string' ? 'application/json' : 'text/plain');
  return {
    method,
    body: typeof body !== 'string' ? JSON.stringify(body) : body,
    headers: Object.assign(
      {},
      headers,
      { Authorization: `ModeCloud ${PROJECT_API_KEY}` },
      contentType ? { 'Content-Type': contentType } : {}
    ),
  };
}

async function list() {
  const url = `${MODEINC_API_URL}/devices?homeId=${HOME_ID}`;
  const res = await fetch(url, createFetchOptions());
  return {
    success: res.status < 300,
    result: await res.json(),
  };
}

async function notify(deviceId, msg) {
  const url = `${MODEINC_API_URL}/devices/${deviceId}/command`;
  const res = await fetch(url, createFetchOptions('PUT', msg));
  return {
    success: res.status < 300,
    result: await res.json(),
  };
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
  console.log('updloading flow package', params);
  const store = new S3Store({
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
    awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    s3BucketName: process.env.S3_BUCKET_NAME,
    s3BaseKey: process.env.S3_BASE_KEY,
  });
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
      const deviceId = process.argv[3];
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
      console.log(await notify(deviceId, msg));
      break;
    default:
      console.error('No such command available: ', command);
      break;
  }
}

if (require.main === module) {
  main();
}
