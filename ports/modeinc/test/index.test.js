/* @flow */
import test from 'ava';
import fs from 'fs';
import path from 'path';
import EventEmitter from 'events';
import crypto from 'crypto';
import express from 'express';
import bodyParser from 'body-parser';
import auth from 'basic-auth';
import fetch from 'isomorphic-fetch';
import jwt from 'jsonwebtoken';
import { startup as startupAgent, shutdown as shutdownAgent } from '..';

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

  app.use(bodyParser.json());

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
    const { name: username, pass: password } = auth(req) || {};
    console.log('username=', username, ', password', password);
    if (username === MOCK_USERNAME && password === MOCK_PASSWORD) {
      console.log('### received HELLO request from flow ###');
      mockEvent.emit('hello', username);
      res.json({ message: `hello, ${username}` });
    } else {
      const message = 'Authentication required to access to /hello';
      mockEvent.emit('hello:error', new Error(message));
      res.status(400).json({ success: false, message });
    }
  });

  app.post('/token', (req, res) => {
    const { deviceId, connectionId, nonce, state } = req.body;
    if (connectionId && deviceId) {
      console.log('### received token request from agent ###');
      const token = jwt.sign({
        iss: 'MOCK_ISSUER',
        aud: 'MOCK_ISSUER',
        sub: `${connectionId}::${deviceId}`,
        nonce,
        entity_type: 'device',
      }, 'secret', { algorithm: 'HS256' });
      mockEvent.emit('token', [token, state]);
      res.json({ success: true, message: `hello, ${deviceId}` });
    } else {
      const message = 'Invalid auth token request';
      mockEvent.emit('token:error', new Error(message));
      res.status(400).json({ success: false, message });
    }
  });

  app.post('/notify-status', (req, res) => {
    const { status } = req.body;
    const token = req.get('authorization');
    console.log('#### token => ', token);
    console.log(req.body);
    if (token) {
      mockEvent.emit('notify-status', status);
      res.json({ success: true, message: 'status notified' });
    } else {
      const message = 'No auth token specified';
      mockEvent.emit('notify-status:error', new Error(message));
      res.status(400).json({ success: false, message });
    }
  });

  return new Promise((resolve) => {
    app.listen(port, () => {
      console.log('### mock server started up. ###');
      resolve();
    });
  });
}

async function waitHttpCall(name, timeout = 10000) {
  return new Promise((resolve, reject) => {
    mockEvent.once(name, resolve);
    mockEvent.once(`${name}:error`, reject);
    setTimeout(() => {
      reject(new Error('mock event wait time out'));
    }, timeout);
  });
}


let _agent;
let _token;
let _state;

function headerline(msg) {
  console.log('');
  console.log('*******************************');
  console.log(msg);
  console.log('*******************************');
  console.log('');
}

/**
 *
 */
test.before(async () => {
  headerline('before');
  const configFile = path.join(process.cwd(), '.enebular-config.json');
  if (fs.existsSync(configFile)) {
    fs.unlinkSync(configFile);
  }
  _agent = await startupAgent();
  await startMockService();
  await delay(5000);
});

/**
 *
 */
test.serial('notify device to register client', async (t) => {
  headerline('register client');
  let msg = {
    action: 'register',
    parameters: {
      deviceId: DEVICE_ID,
      connectionId: 'conn001',
      agentManagerBaseUrl: `http://localhost:${port}`,
      authRequestUrl: `http://localhost:${port}/token`,
    },
  };

  const waitToken = waitHttpCall('token', 20000);

  let ret = await notify(DEVICE_ID, msg);
  t.true(ret.success);

  [_token, _state] = await waitToken;
  console.log('### token and state received', _token, _state);

  t.true(typeof _token === 'string');
  t.true(_agent._agentState === 'registered');
});

/**
 *
 */
test.serial('notify device to auth token dispatch', async (t) => {
  headerline('auth token dispatch');
  let msg = {
    action: 'dispatch_auth_token',
    parameters: {
      accessToken: _token,
      idToken: _token,
      state: _state,
    },
  };

  const waitStatus = waitHttpCall('notify-status', 20000);

  let ret = await notify(DEVICE_ID, msg);
  t.true(ret.success);

  const status = await waitStatus;

  t.true(typeof status === 'string');
  t.true(_agent._agentState === 'authenticated');

});

/**
 *
 */
test.serial('notify device to deploy flow package', async (t) => {
  headerline('deploy flow package');
  let msg = await createDeployMessage('01');
  let ret = await notify(DEVICE_ID, msg);
  t.true(ret.success);

  const un = await waitHttpCall('hello', 20000);
  t.true(un === MOCK_USERNAME);

  msg = await createDeployMessage('02');
  ret = await notify(DEVICE_ID, msg);
  t.true(ret.success);
});



/**
 *
 */
test.after.always(async () => {
  headerline('after');
  console.log('### shutting down... ###');
  await shutdownAgent();
});
