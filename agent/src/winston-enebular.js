/* @flow */

import util from 'util';
import fs from 'fs';
import winston from 'winston';
import common from 'winston/lib/winston/common';

const Transport = winston.Transport;
const currentFilename = 'current';

let Enebular = exports.Enebular = function (options) {
  Transport.call(this, options);
  options = options || {};

  //  

  this.cachePath      = options.cachePath     || '/tmp/enebular-log-cache';
  this.sendInterval   = 15;
  this.sendSize       = 100 * 1024;
  this.maxCacheSize   = 5 * 1024 * 1024;
  this.maxUploadSize  = 1 * 1024 * 1024 / 1024;
  this._agentManager   = options.agentManager;

  this._currentPath   = `${this.cachePath}/${currentFilename}`

  if (!fs.existsSync(this.cachePath)) {
    fs.mkdirSync(this.cachePath);
  }

  this._intervalID = setInterval(() => {this._handleTimeTrigger()}, this.sendInterval*1000);
};

util.inherits(Enebular, Transport);

Enebular.prototype.name = 'enebular';

Enebular.prototype.log = function(level, msg, meta, callback) {
  let self = this;

  let output = common.log({
    colorize:    false,
    json:        true,
    level:       level,
    message:     msg,
    meta:        meta,
    stringify:   true,
    timestamp:   true,
    prettyPrint: false,
    raw:         true, //?
    label:       '',
    depth:       null,
    formatter:   this.formatter,
    humanReadableUnhandledException: this.humanReadableUnhandledException //?
  });

  this._appendOutput(output, callback);
};

Enebular.prototype._appendOutput = function(output, callback) {
  let self = this;

  let prefix = (fs.existsSync(this._currentPath)) ? ',\n' : '[\n';
  output = prefix +  output;
  let outputSize = output.length;

  if (this._cachedSize() + outputSize >= this.maxCacheSize) {
    console.log('todo: cache oversize');
  }

  let currentSize = 0;
  if (fs.existsSync(this._currentPath)) {
    let stats = fs.statSync(this._currentPath);
    currentSize = stats.size;
  }
  if (currentSize + outputSize >= this.maxUploadSize) {
    this._finalizeCurrent();
  }

  fs.appendFileSync(this._currentPath, output);
  self.emit('logged');
  callback(null, true);

  // todo: check if it's time to upload based on sendSize
}

Enebular.prototype._cachedSize = function() {
  console.log('todo: total cache size');
  return 0;
}

Enebular.prototype._finalizeCurrent = function() {

  if (!fs.existsSync(this._currentPath)) {
    return;
  }

  let finalizedName = `enebular.${Date.now()}.todo-hash`;
  let finalizedPath = `${this.cachePath}/${finalizedName}`;

  console.log(`Finalizing current to: ${finalizedName}`);

  fs.appendFileSync(this._currentPath, '\n]');

  fs.renameSync(this._currentPath, finalizedPath);
}

Enebular.prototype._uploadFinialized = async function() {

  let filenames = fs.readdirSync(this.cachePath);
  if (!filenames.length) {
    return;
  }

  // todo: oldest first

  const nameMatch = new RegExp('^enebular.');

  for (let filename of filenames) {

    if (!filename.match(nameMatch)) {
      console.log('Skipping: ' + filename);
      continue;
    }

    const filePath = `${this.cachePath}/${filename}`;

    const stat = fs.statSync(filePath);
    if (stat.size < 1) {
      console.log('Removing empty log: ' + filename);
      unlinkSync(filePath);
      continue;
    }

    console.log(`Sending log: ${filename} (${stat.size}B)`);

    await this._agentManager.sendLog(filePath);
    fs.unlinkSync(filePath);

  }

}

Enebular.prototype._handleTimeTrigger = async function() {

  if (this._agentManager._agentState !== 'authenticated') {
    console.log('Not sending logs as not authenticated');
    return;
  }

  await this._uploadFinialized();
  await this._finalizeCurrent();
  await this._uploadFinialized();
}

Enebular.prototype.close = function() {
  var self = this;

  //
};
