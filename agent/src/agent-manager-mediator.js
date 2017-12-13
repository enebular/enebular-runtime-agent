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
      // batch logs
      let logList = fs.readdirSync('logs/logs')
      // on some systems .DS_Store is created so 
      if (logList[0] === '.DS_Store' || logList[logList.length-1] === '.DS_Store') {
        await unlinkAsync('logs/logs/.DS_Store')
        logList = logList.slice(1)
      }
      if (!logList.length) {
        return
      }
      const destinationFile = logList[0]
      const logsToConcatenate = logList.slice(1)
      // concatenate existing logs into the oldest existing log file
      for (let filename of logsToConcatenate) {
        const fileContent = await readFileAsync(`logs/logs/${filename}`, 'utf8')
        const stats = await statAsync(`logs/logs/${filename}`)
        const fileSize = stats.size
        if (!fileSize) {
          await unlinkAsync(`logs/logs/${filename}`)
        } else {
          await appendFileAsync(`logs/logs/${destinationFile}`, fileContent)
          await unlinkAsync(`logs/logs/${filename}`)
        }
      }
      // check if accumulated log file is still empty
      const destinationFileStats = await statAsync(`logs/logs/${destinationFile}`)
      if (!destinationFileStats.size) {
        log('No log content')
        await unlinkAsync(`logs/logs/${destinationFile}`)
        return
      }
      log('Sending logs...');
      // post logs
      const form = new FormData()
      form.append(destinationFile, fs.createReadStream(`logs/logs/${destinationFile}`))
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
        log('Logs sent')
        await unlinkAsync(`logs/logs/${destinationFile}`)
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
