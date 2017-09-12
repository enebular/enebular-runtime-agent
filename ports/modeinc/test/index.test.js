/* @flow */
import test from 'ava';
import fs from 'fs';
import path from 'path';
import EventEmitter from 'events';
import crypto from 'crypto';
import express from 'express';
import auth from 'basic-auth';
import fetch from 'isomorphic-fetch';
import startupAgent from '..';

const MODEINC_API_URL = 'https://api.tinkermode.com';
const { PROJECT_ID, PROJECT_API_KEY, HOME_ID, DEVICE_ID, MOCK_SERVER_PORT } = process.env;

if (!PROJECT_ID || !PROJECT_API_KEY || !HOME_ID || !DEVICE_ID) {
  throw new Error('one of the required environment variables are not set: PROJECT_ID, PROJECT_API_KEY, HOME_ID, or DEVICE_ID');
}

const port = MOCK_SERVER_PORT || '33000';

async function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(), ms);
  });
}

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

async function notify(deviceId, msg) {
  const url = `${MODEINC_API_URL}/devices/${deviceId}/command`;
  const res = await fetch(url, createFetchOptions('PUT', msg));
  return {
    success: res.status < 300,
    result: await res.text(),
  };
}

function readJSONFile(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const FLOW_PACKAGE_STORE = {};

async function createDeployMessage(flowId) {
  const params = {
    flows: readJSONFile(path.join(__dirname, 'data', flowId, 'flows.json')),
    creds: readJSONFile(path.join(__dirname, 'data', flowId, 'flows_cred.json')),
    packages: readJSONFile(path.join(__dirname, 'data', flowId, 'packages.json')),
  };
  const downloadId = crypto.randomBytes(8).toString('hex');
  FLOW_PACKAGE_STORE[downloadId] = params;
  const downloadUrl = `http://localhost:${port}/download/${downloadId}`;
  return { action: 'deploy', parameters: { downloadUrl } };
}

/**
 *
 */
const MOCK_USERNAME = 'aaa';
const MOCK_PASSWORD = 'bbb';

const mockEvent = new EventEmitter();

/**
 *
 */
async function startMockService() {
  const app = express();

  app.get('/', (req, res) => {
    res.json({ message: 'hello' });
  });

  app.get('/download/:id', (req, res) => {
    const pack = FLOW_PACKAGE_STORE[req.params.id];
    if (pack) {
      res.json(pack);
    } else {
      res.status(404).json({ message: 'flow package not found' });
    }
  });

  app.get('/hello', (req, res) => {
    const { name: username, pass: password } = auth(req);
    console.log('username=', username, ', password', password);
    if (username === MOCK_USERNAME && password === MOCK_PASSWORD) {
      console.log('### received HELLO request flom flow ###');
      mockEvent.emit('hello', username);
      res.json({ message: `hello, ${username}` });
    } else {
      console.log('### invalid HELLO request received ###');
      res.status(400).json({ message: 'unauthorized access' });
    }
  });

  return new Promise((resolve) => {
    app.listen(port, () => resolve());
  });
}

async function waitFlowHttpCall(name, timeout = 10000) {
  return new Promise((resolve, reject) => {
    mockEvent.once(name, resolve);
    setTimeout(() => {
      reject(new Error('mock event wait time out'));
    }, timeout);
  });
}


let agent;

/**
 *
 */
test.before(async () => {
  await startMockService();
  agent = await startupAgent();
  await delay(5000);
});

/**
 *
 */
test('notify device to deploy flow package', async (t) => {
  let msg = await createDeployMessage('01');
  let ret = await notify(DEVICE_ID, msg);
  t.true(ret.success);

  const un = await waitFlowHttpCall('hello', 20000);
  t.true(un === MOCK_USERNAME);

  msg = await createDeployMessage('02');
  ret = await notify(DEVICE_ID, msg);
  t.true(ret.success);
});

/**
 *
 */
test.after(async () => {
  console.log('shutting down...');
  if (agent) {
    await agent.shutdown();
  }
});
