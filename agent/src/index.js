import fs from 'fs';
import { spawn, exec } from 'child_process';
import unzip from 'unzip2';

/**
 *
 */
export default class EnebularAgent {
  constructor({ command, args, pkgDir }) {
    this._command = command;
    this._args = args;
    this._pkgDir = pkgDir
  }

  async updatePackage(pkgStream) {
    await new Promise((resolve, reject) => {
      pkgStream
        .pipe(unzip.Extract({ path: this._pkgDir }))
        .on('finish', resolve)
        .on('error', reject);
    });
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
