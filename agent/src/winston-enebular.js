/* @flow */

import util from 'util';
import fs from 'fs';
import winston from 'winston';
import common from 'winston/lib/winston/common';

const Transport = winston.Transport;
const currentFilename = 'current';
const finalizedNameMatch = new RegExp('^enebular-([0-9]+)-([0-9]+)$');

let Enebular = exports.Enebular = function (options) {
  Transport.call(this, options);
  options = options || {};

  //

  this.cachePath      = options.cachePath     || '/tmp/enebular-log-cache';
  this.sendInterval   = 15;
  this.sendSize       = 2*1024;//100 * 1024;
  this.maxCacheSize   = 500;//5 * 1024 * 1024;
  this.maxUploadSize  = 200;//1 * 1024 * 1024;
  this._agentManager   = options.agentManager;

  this._currentPath   = `${this.cachePath}/${currentFilename}`

  if (!fs.existsSync(this.cachePath)) {
    fs.mkdirSync(this.cachePath);
  }

  this._sending = false;
  this._sendingFile = null;
  this._closed = false;

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
  output = prefix + output;
  let outputSize = output.length;

  // todo: limit attempts
  while (this._cachedSize() + outputSize >= this.maxCacheSize) {
    let ok = this._shrinkCache();
    if (!ok) {
      console.error("Failed to shrink cache enough");
      break;
    }
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

  if (this._cachedSize() > this.sendSize) {
    console.log('Send size reached');
    this._send();
  }
}

Enebular.prototype._cachedSize = function() {

  let cachedSize = 0;

  /* current file */
  if (fs.existsSync(this._currentPath)) {
    const stats = fs.statSync(this._currentPath);
    cachedSize += stats.size;
  }

  /* finalized files */
  let filenames = fs.readdirSync(this.cachePath);
  for (let filename of filenames) {
    if (!filename.match(finalizedNameMatch)) {
      continue;
    }
    const filePath = `${this.cachePath}/${filename}`;
    const stats = fs.statSync(filePath);
    cachedSize += stats.size;
  }

  return cachedSize;
}

Enebular.prototype._getOrderedFinalized = function() {

  let filenames = fs.readdirSync(this.cachePath);
  filenames = filenames.filter(filename => filename.match(finalizedNameMatch));
  filenames.sort((a,b) => {
    let aMatch = a.match(finalizedNameMatch);
    let bMatch = b.match(finalizedNameMatch);
    //console.log(`aMatch: ${aMatch[1]}:${aMatch[2]}, bMatch: ${bMatch[1]}:${bMatch[2]}`)
    if (aMatch[1] < bMatch[1]) {
      return -1;
    }
    if (aMatch[1] > bMatch[1]) {
      return 1;
    }
    if (aMatch[2] < bMatch[2]) {
      return -1;
    }
    if (aMatch[2] > bMatch[2]) {
      return 1;
    }
    return 0;
  })

  return filenames;
}

Enebular.prototype._shrinkCache = function() {

  console.log('Shrinking cache...');

  let oldest = null;
  let filenames = this._getOrderedFinalized();
  if (filenames && filenames.length > 0) {
      oldest = filenames[0];
      if (oldest === this._sendingFile) {
        console.log(`Excluding log currently being sent from cache shrink (${oldest})`);
        oldest = (filenames.length > 1) ? filenames[1] : null;
      }
  }
  if (oldest) {
    console.log(`Removing: oldest (${oldest})`);
    let filePath = `${this.cachePath}/${oldest}`;
    fs.unlinkSync(filePath);
    return true;
  }

  if (fs.existsSync(this._currentPath)) {
    console.log('Removing: current');
    fs.unlinkSync(this._currentPath);
    return true;
  }

  return false;
}

Enebular.prototype._finalizeCurrent = function() {

  if (!fs.existsSync(this._currentPath)) {
    return;
  }

  let finalizedName;
  let finalizedPath;
  let cnt = 0;
  const maxCnt = 99;
  while (cnt <= maxCnt) {
    finalizedName = `enebular-${Date.now()}-${cnt}`;
    finalizedPath = `${this.cachePath}/${finalizedName}`;
    if (!fs.existsSync(finalizedPath)) {
      break;
    }
    cnt++;
  }
  if (cnt >= maxCnt) {
    console.error('Failed to find unique name for log file');
    return;
  }

  console.log(`Finalizing current to: ${finalizedName}`);

  fs.appendFileSync(this._currentPath, '\n]');

  fs.renameSync(this._currentPath, finalizedPath);
}

Enebular.prototype._sendFinialized = async function() {

  let filenames = this._getOrderedFinalized();
  if (filenames.length < 1) {
    return;
  }

  console.log(`Sending ${filenames.length} logs...`);

  for (let filename of filenames) {

    const filePath = `${this.cachePath}/${filename}`;

    if (!fs.existsSync(filePath)) {
      console.log(`Upload target log no longer exists (${filename})`);
      continue;
    }

    this._sendingFile = filename;

    const stats = fs.statSync(filePath);
    if (stats.size < 1) {
      console.log('Removing empty log: ' + filename);
    } else {
      console.log(`Sending: ${filename} (${stats.size}B)`);
      await this._agentManager.sendLog(filePath);
    }

    fs.unlinkSync(filePath);

    this._sendingFile = null;

    console.log(`Sent: ${filename}`);

  }

}

Enebular.prototype._send = async function() {

  console.log('Starting logs send...');

  if (this._agentManager._agentState !== 'authenticated') {
    console.log('Not sending logs as not authenticated');
    return;
  }

  if (this._sending) {
    console.log('Already sending logs');
    return;
  }

  this._sending = true;

  await this._sendFinialized();
  await this._finalizeCurrent();
  await this._sendFinialized();

  this._sending = false;

  console.log('Logs send complete');
}

Enebular.prototype._handleTimeTrigger = function() {
  console.log('Send time trigger...');
  this._send();
}

Enebular.prototype.close = async function() {
  if (this._closed) {
    return;
  }

  clearInterval(this._intervalID);
  this._closed = true;
};

Enebular.prototype.cleanUp = async function() {
  await this._send();
};
