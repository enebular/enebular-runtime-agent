/* @flow */
import fs from 'fs';
import EventEmitter from 'events';
import path from 'path';
import { spawn, exec } from 'child_process';
import fetch from 'isomorphic-fetch';
import type { ChildProcess } from 'child_process';


/**
 *
 */
type NodeRedFlowPackage = {
  flows: Object[],
  creds: Object,
  packages: Object,
};


/**
 *
 */
export default class NodeREDController {
  _dir: string;
  _command: string;
  _cproc: ?ChildProcess = null;
  _actions: Array<() => Promise<any>>
  _isProcessingActions: ?boolean;

  constructor(dir: string, command: string, emitter: EventEmitter) {
    this._dir = dir;
    this._command = command;
    this._isProcessingActions = false;
    this._actions = [];
    this._registerHandler(emitter);
  }

  _registerHandler(emitter: EventEmitter) {
    emitter.on('update-flow', (params) => this._queueAction(() => this._fetchAndUpdateFlow(params)));
    emitter.on('deploy', (params) => this._queueAction(() => this._fetchAndUpdateFlow(params)));
    emitter.on('start', () => this._queueAction(() => this._startService()));
    emitter.on('restart', () => this._queueAction(() => this._restartService()));
    emitter.on('shutdown', () => this._queueAction(() => this._shutdownService()));
  }

  _queueAction(fn: () => Promise<any>) {
    this._actions.push(fn);
    if (!this._isProcessingActions) {
      this._processActions();
    }
  }

  async _processActions() {
    this._isProcessingActions = true;
    while (this._actions.length > 0) {
      const action = this._actions.shift();
      await action();
    }
    this._isProcessingActions = false;
  }

  async _fetchAndUpdateFlow(params: { downloadUrl: string }) {
    await this._downloadAndUpdatePackage(params.downloadUrl);
    await this._restartService();
  }

  async _downloadAndUpdatePackage(downloadUrl: string) {
    const res = await fetch(downloadUrl);
    if (res.status >= 400) {
      throw new Error('invalid url');
    }
    const body = await res.json();
    return this._updatePackage(body);
  }

  async _updatePackage(flowPackage: NodeRedFlowPackage) {
    const updates = [];
    if (flowPackage.flow || flowPackage.flows) {
      const flows = flowPackage.flow || flowPackage.flows;
      updates.push(
        new Promise((resolve, reject) => {
          const flowFilePath = path.join(this._dir, '.node-red-config', 'flows.json');
          fs.writeFile(flowFilePath, JSON.stringify(flows), (err) => err ? reject(err) : resolve());
        })
      );
    }
    if (flowPackage.cred || flowPackage.creds) {
      const creds = flowPackage.cred || flowPackage.creds;
      updates.push(
        new Promise((resolve, reject) => {
          const credFilePath = path.join(this._dir, '.node-red-config', 'flows_cred.json');
          fs.writeFile(credFilePath, JSON.stringify(creds), (err) => err ? reject(err) : resolve());
        })
      );
    }
    if (flowPackage.packages) {
      updates.push(
        new Promise((resolve, reject) => {
          const packageJSONFilePath = path.join(this._dir, '.node-red-config', 'enebular-agent-dynamic-deps', 'package.json');
          const packageJSON = JSON.stringify({
            name: 'enebular-agent-dynamic-deps',
            version: '0.0.1',
            dependencies: flowPackage.packages,
          }, null, 2);
          fs.writeFile(packageJSONFilePath, packageJSON, (err) => err ? reject(err) : resolve());
        })
      );
    }
    await Promise.all(updates);
    await this._resolveDependency();
  }

  async _resolveDependency() {
    return new Promise((resolve, reject) => {
      const cproc = spawn('npm', [ 'install', 'enebular-agent-dynamic-deps' ], { stdio: 'inherit', cwd: this._dir });
      cproc.on('error', reject);
      cproc.once('exit', resolve);
    });
  }

  async _startService() {
    return new Promise((resolve, reject) => {
      const [command, ...args] = this._command.split(/\s+/);
      const cproc = spawn(command, args, { stdio: 'inherit', cwd: this._dir });
      cproc.on('error', reject);
      cproc.once('exit', resolve);
      this._cproc = cproc;
    });
  }

  async _shutdownService() {
    return new Promise((resolve, reject) => {
      const cproc = this._cproc;
      if (cproc) {
        cproc.kill();
        cproc.once('exit', () => {
          this._cproc = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  async _restartService() {
    await this._shutdownService();
    await this._startService();
  }
}
