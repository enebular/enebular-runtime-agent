/* @flow */
import fs from 'fs';
import path from 'path';
import { spawn, exec } from 'child_process';
import fetch from 'isomorphic-fetch';
import type { ChildProcess } from 'child_process';

/**
 *
 */
type EnebularAgentConfig = {
  command: string,
  args: string[],
  pkgDir: string,
};

type NodeRedFlowPackage = {
  flows: Object[],
  creds: Object,
  packages: Object,
};

/**
 *
 */
export default class EnebularAgent {
  _command: string;
  _args: string[];
  _pkgDir: string;
  _cproc: ?ChildProcess = null;

  constructor({ command, args, pkgDir }: EnebularAgentConfig) {
    this._command = command;
    this._args = args;
    this._pkgDir = pkgDir;
  }

  async downloadAndUpdatePackage(downloadUrl: string) {
    const res = await fetch(downloadUrl);
    if (res.status >= 400) {
      throw new Error('invalid url');
    }
    const body = await res.json();
    return this.updatePackage(body);
  }

  async updatePackage(flowPackage: NodeRedFlowPackage) {
    const updates = [];
    if (flowPackage.flow || flowPackage.flows) {
      const flows = flowPackage.flow || flowPackage.flows;
      updates.push(
        new Promise((resolve, reject) => {
          const flowFilePath = path.join(this._pkgDir, '.node-red-config', 'flows.json');
          fs.writeFile(flowFilePath, JSON.stringify(flows), (err) => err ? reject(err) : resolve());
        })
      );
    }
    if (flowPackage.cred || flowPackage.creds) {
      const creds = flowPackage.cred || flowPackage.creds;
      updates.push(
        new Promise((resolve, reject) => {
          const credFilePath = path.join(this._pkgDir, '.node-red-config', 'flows_cred.json');
          fs.writeFile(credFilePath, JSON.stringify(creds), (err) => err ? reject(err) : resolve());
        })
      );
    }
    if (flowPackage.packages) {
      updates.push(
        new Promise((resolve, reject) => {
          const packageJSONFilePath = path.join(this._pkgDir, '.node-red-config', 'enebular-agent-dynamic-deps', 'package.json');
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
    await this.resolveDependency();
  }

  async resolveDependency() {
    return new Promise((resolve, reject) => {
      const cproc = spawn('npm', [ 'install', 'enebular-agent-dynamic-deps' ], { stdio: 'inherit', cwd: this._pkgDir });
      cproc.on('error', reject);
      cproc.once('exit', resolve);
    });
  }

  async startService() {
    return new Promise((resolve, reject) => {
      const cproc = spawn(this._command, this._args, { stdio: 'inherit', cwd: this._pkgDir });
      cproc.on('error', reject);
      cproc.once('exit', resolve);
      this._cproc = cproc;
    });
  }

  async shutdownService() {
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

  async restartService() {
    await this.shutdownService();
    await this.startService();
  }
}
