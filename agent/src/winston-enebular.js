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
  this.sendSize       = 512;//100 * 1024;
  this.maxCacheSize   = 1*1024;//5 * 1024 * 1024;
  this.maxUploadSize  = 512;//1 * 1024 * 1024;
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
  output = prefix + output;
  let outputSize = output.length;

  // todo: limit attempts
  while (this._cachedSize() + outputSize >= this.maxCacheSize) {
    let ok = this._shrinkCache();
    if (!ok) {
      console.log("failed to shrink cache");
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

  // todo: check if it's time to upload based on sendSize (i.e size trigger)
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

Enebular.prototype._shrinkCache = function() {

  console.log('Shrinking cache...');

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

  if (filenames.length > 0) {
      console.log(`Removing: oldest (${filenames[0]})`);
      let filePath = `${this.cachePath}/${filenames[0]}`;
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

  let finalizedName = `enebular-${Date.now()}-0`;
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

  for (let filename of filenames) {

    if (!filename.match(finalizedNameMatch)) {
      console.log('Skipping: ' + filename);
      continue;
    }

    const filePath = `${this.cachePath}/${filename}`;

    const stat = fs.statSync(filePath);
    if (stat.size < 1) {
      console.log('Removing empty log: ' + filename);
      fs.unlinkSync(filePath);
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
