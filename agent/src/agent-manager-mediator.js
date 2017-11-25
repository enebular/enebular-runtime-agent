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

/**
 *
 */
export default class AgentManagerMediator extends EventEmitter {
  _baseUrl: ?string;
  _accessToken: ?string;
  _pid: ?number;
  _nodeRed: NodeREDController;

  constructor(nodeRed: NodeREDController) {
    super();
    this._nodeRed = nodeRed;
  }

  setBaseUrl(baseUrl: string) {
    log('setBaseUrl', baseUrl)
    this._baseUrl = baseUrl;

  }

  setAccessToken(accessToken: string) {
    log('accessToken', accessToken)
    this._accessToken = accessToken;
  }

  exitStatusReport() {
    setTimeout(process.exit, 5000)
    console.log('*** device shutting down in 5 seconds ***')
  }

  async startLogReport() {
    log('startLogReport');
    const { _baseUrl: baseUrl, _accessToken: accessToken } = this;
    if (!baseUrl || !accessToken) {
      log('Cannnot start status report without baseUrl or access Token.');
      return;
    }
    const readDir = promisify(fs.readdir)
    const readFile = promisify(fs.readFile)
    const unlink = promisify(fs.unlink)
    const logList = await readDir('logs/logs')
    console.log('logList----------------------', logList)
    for (let file of logList) {
      const form = new FormData()
      form.append(file, fs.createReadStream(`logs/logs/${file}`))
      const res = await fetch(`${baseUrl}/record-logs`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'multipart/form-data',
        },
        body: form
      });
      if (!res.ok) {
        const message = await res.text();
        // const err = new Error('Cannot record logs to agent manager: ');
        return this.emit('error', message);
      }
      // delete the lgo file
      await unlink(`logs/logs/${file}`)
    }
    
    // setInterval(recordLogs, 5000)
  }

  startStatusReport() {
    log('startStatusReport');
    const { _baseUrl: baseUrl, _accessToken: accessToken } = this;
    if (!baseUrl || !accessToken) {
      log('Cannnot start status report without baseUrl or access Token.');
      return;
    }
    const notifyStatus = async (kill) => {
      const status = kill ? 'disconnected' : this._nodeRed.getStatus();
      console.log('*** send status notification ***', status);
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
      kill ? this.exitStatusReport() : null
    };
    notifyStatus();
    this._pid = setInterval(notifyStatus, 30000);

    const cleanUp = () => {
      clearInterval(this._pid);
      notifyStatus(true)
    }
    process.on('SIGINT', function () {
      cleanUp()
    });
    process.on('uncaughtException', function () {
      cleanUp()
    });
  }

  sortLogs() {

  }
}
