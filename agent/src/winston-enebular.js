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
  this.sendInterval   = 30;
  this.sendSize       = 100 * 1024;
  this.maxCacheSize   = 5 * 1024 * 1024;
  this.maxUploadSize  = 1 * 1024 * 1024 / 1024;

  this._currentPath   = `${this.cachePath}/${currentFilename}`

  if (!fs.existsSync(this.cachePath)) {
    fs.mkdirSync(this.cachePath);
  }
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

  console.log('appending: ' + outputSize);

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
}

Enebular.prototype._cachedSize = function() {
  console.log('todo: total cache size');
  return 0;
}

Enebular.prototype._finalizeCurrent = function() {

  let finalizedName = `${Date.now()}.###todo-hash###`;
  let finalizedPath = `${this.cachePath}/${finalizedName}`;

  console.log(`Finalizing current to: ${finalizedName}`);

  fs.appendFileSync(this._currentPath, '\n]');

  fs.renameSync(this._currentPath, finalizedPath);
}

Enebular.prototype.close = function() {
  var self = this;

  //
};
