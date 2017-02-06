import fs from 'fs';
import fetch from 'isomorphic-fetch';

const MODEINC_API_URL = 'https://api.tinkermode.com';
const { PROJECT_ID, PROJECT_API_KEY, FLOW_PACKAGE_URL, HOME_ID } = process.env;

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

async function main() {
  const command = process.argv[2] || 'list';
  switch(command) {
    case 'list':
      console.log(await list());
      break;
    case 'notify':
      const deviceId = process.argv[3];
      const action = process.argv[4];
      const parameters =
        action === 'update-flow' ?
        { downloadUrl: FLOW_PACKAGE_URL } :
        {};
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
