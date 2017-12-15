/* @flow */
import EventEmitter from 'events';
import fetch from 'isomorphic-fetch';
import debug from 'debug';
import NodeREDController from './node-red-controller';
import fs from 'fs'
import FormData from 'form-data'
import { promisify } from 'util'

/**
 *
 */
const log = debug('enebular-runtime-agent:agent-manager-mediator');

const readDirAsync = promisify(fs.readdir)
const readFileAsync = promisify(fs.readFile)
const writeFileAsync = promisify(fs.writeFile)
const appendFileAsync = promisify(fs.appendFile)
const statAsync = promisify(fs.stat)
const unlinkAsync = promisify(fs.unlink)
/**
 *
 */
export default class AgentManagerMediator extends EventEmitter {
  _baseUrl: ?string;
  _accessToken: ?string;
  _pid: ?number;
  _logInterval: ?number
  _agentState: ?string;

  constructor() {
    super();
  }

  setAgentState(agentState: string) {
    this._agentState = agentState
  }

  setBaseUrl(baseUrl: string) {
    this._baseUrl = baseUrl

  }

  setAccessToken(accessToken: string) {
    this._accessToken = accessToken
  }

  async sendLog(filename: string) {

    log(`Sending log: ${filename}`);

    if (this._agentState !== 'authenticated') {
      throw new Error("Can't send log while not authenticated");
      return;
    }

    const form = new FormData();
    form.append("events", fs.createReadStream(filename))
    const res = await fetch(`${this._baseUrl}/record-logs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this._accessToken}`,
      },
      body: form
    });
    if (!res.ok) {
      const message = await res.text();
      throw new Error('Failed to record logs to agent manager');
    } else {
      log('Log sent')
    }
  }

  async recordLogs() {
    try {
      const logDir = '/tmp/enebular-http-log-cache';
      const logFilenameBase = 'enebular-http-log-cache.log';

      log('Sending logs...');

      let filenames = fs.readdirSync(logDir)
      if (!filenames.length) {
        log('No log files');
        return;
      }

      // todo: oldest first

      const nameMatch = new RegExp(`^${logFilenameBase}`);
      for (let filename of filenames) {

        if (!filename.match(nameMatch)) {
          console.log('Skipping: ' + filename);
          continue;
        }

        const filePath = `${logDir}/${filename}`;

        const stat = await statAsync(filePath);
        if (stat.size < 1) {
          console.log('Removing empty log: ' + filename);
          await unlinkAsync(filePath);
          continue;
        }

        const fileContent = await readFileAsync(filePath, 'utf8');
        const lines = fileContent.toString().split('\n');
        let events = [];
        for (let line of lines) {
          if (line.length > 0) {
            events.push(JSON.parse(line));
          }
        }

        const tmpFile = `${logDir}/${Date.now()}`;
        const eventsStr = JSON.stringify(events);
        await writeFileAsync(tmpFile, eventsStr);

        await sendLog(tmpFile);

        await unlinkAsync(tmpFile);

      }

    } catch (err) {
      console.error('_recordLog error', err)
    }
  }

  async notifyStatus(disconnectedOverride: boolean) {
    const { _baseUrl: baseUrl, _accessToken: accessToken } = this
    //const status = disconnectedOverride ? 'disconnected' : this._nodeRed.getStatus();
    const status = 'disconnected';
    log(`Sending status (${status})...`);
    const res = await fetch(`${baseUrl}/notify-status`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const message = await res.text();
      const err = new Error('Cannot notify status to agent manager: ');
      this.emit('error', err);
    }
  }

  async cleanUp() {
    log('Cleanup...')
    clearInterval(this._pid);
    clearInterval(this._logInterval)
    // if authenticated, then notify last minute
    if (this._agentState === 'authenticated') {
      await Promise.all([
        //this.recordLogs(),
        this.notifyStatus(true)
      ])
    }
  }

  startStatusReport() {
    log('Starting status reporting...');
    const { _baseUrl: baseUrl, _accessToken: accessToken } = this
    if (!baseUrl || !accessToken) {
      log('Cannnot start status report without baseUrl or access Token.');
      return;
    }
    this.notifyStatus(false);
    this._pid = setInterval(() => this.notifyStatus(false), 30000);
  }

  startLogReport() {
    /*
    log('Starting log reporting...');
    const { _baseUrl: baseUrl, _accessToken: accessToken } = this;
    if (!baseUrl || !accessToken) {
      log('Cannnot start log report without baseUrl or access Token.');
      return;
    }
    this._logInterval = setInterval(() => this.recordLogs(), 30000)
    */
  }
}
