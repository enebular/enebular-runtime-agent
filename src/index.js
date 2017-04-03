import fs from 'fs';
import path from 'path';
import { spawn, exec } from 'child_process';
import fetch from 'isomorphic-fetch';

/**
 *
 */
export default class EnebularAgent {
  constructor({ command, args, pkgDir }) {
    this._command = command;
    this._args = args;
    this._pkgDir = pkgDir
  }

  async downloadAndUpdatePackage(downloadUrl) {
    console.log('downloadAndUpdatePackage', downloadUrl)
    const res = await fetch(downloadUrl);
    if (res.status >= 400) {
      throw new Error('invalid url');
    }
    const body = await res.json();
    return this.updatePackage(body);
  }

  async updatePackage(flowPackage) {
    const updates = [];
    if (flowPackage.flow) {
      updates.push(
        new Promise((resolve, reject) => {
          const flowFilePath = path.join(this._pkgDir, '.node-red-config', 'flows.json');
          fs.writeFile(flowFilePath, JSON.stringify(flowPackage.flow), (err) => err ? reject(err) : resolve());
        })
      );
    }
    if (flowPackage.cred) {
      updates.push(
        new Promise((resolve, reject) => {
          const credFilePath = path.join(this._pkgDir, '.node-red-config', 'flows_cred.json');
          fs.writeFile(credFilePath, JSON.stringify(flowPackage.cred), (err) => err ? reject(err) : resolve());
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
      this._cproc = spawn(this._command, this._args, { stdio: 'inherit', cwd: this._pkgDir });
      this._cproc.on('error', reject);
      this._cproc.once('exit', resolve);
    });
  }

  async shutdownService() {
    return new Promise((resolve, reject) => {
      if (this._cproc) {
        this._cproc.kill();
        this._cproc.once('exit', () => {
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
