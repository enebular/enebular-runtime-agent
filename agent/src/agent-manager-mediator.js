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
  _nodeRed: NodeREDController;
  _agentState: ?string;

  constructor(nodeRed: NodeREDController) {
    super();
    this._nodeRed = nodeRed;
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

  async recordLogs() {
    try {
      const { _baseUrl: baseUrl, _accessToken: accessToken } = this;
      const logDir = '/tmp/enebular-http-log-cache';
      const logFilenameBase = 'enebular-http-log-cache.log';

      let filenames = fs.readdirSync(logDir)
      if (!filenames.length) {
        log('No log files');
        return
      }

      // concatenate existing logs into the oldest existing log file
      // todo: oldest first
      const destinationPath = `${logDir}/${logFilenameBase}.collection.${Date.now()}`;
      for (let filename of filenames) {
        const filePath = `${logDir}/${filename}`;
        console.log('stat: ' + filePath);
        const stat = await statAsync(filePath);
        if (stat.size > 0) {
          const fileContent = await readFileAsync(filePath, 'utf8');
          await appendFileAsync(destinationPath, fileContent);
        }
        console.log('unlink: ' + filePath);
        await unlinkAsync(filePath);
      }
      // check if accumulated log file is still empty
      const collectionStat = await statAsync(destinationPath);
      if (!collectionStat.size) {
        log('No log content')
        await unlinkAsync(destinationPath);
        return
      }

      log('Sending logs...');
      // post logs
      const form = new FormData()
      form.append("events", fs.createReadStream(destinationPath))
      const res = await fetch(`${baseUrl}/record-logs`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
        body: form
      });
      if (!res.ok) {
        const message = await res.text();        
        const err = new Error('Cannot record logs to agent manager: ');
        this.emit('error', message);
      } else {
        log(`Logs sent (${collectionStat.size}B)`)
        await unlinkAsync(destinationPath)
      }
    } catch (err) {
      console.error('_recordLog error', err)
    }
  }

  async notifyStatus(disconnectedOverride: boolean) {
    const { _baseUrl: baseUrl, _accessToken: accessToken } = this
    const status = disconnectedOverride ? 'disconnected' : this._nodeRed.getStatus();
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
        this.recordLogs(),
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
    log('Starting log reporting...');
    const { _baseUrl: baseUrl, _accessToken: accessToken } = this;
    if (!baseUrl || !accessToken) {
      log('Cannnot start log report without baseUrl or access Token.');
      return;
    }
    this._logInterval = setInterval(() => this.recordLogs(), 30000)
  }
}
