/* @flow */

import util from 'util';
import fs from 'fs';
import winston from 'winston';
import common from 'winston/lib/winston/common';

const statAsync = util.promisify(fs.stat);
const unlinkAsync = util.promisify(fs.unlink);

const Transport = winston.Transport;
const currentFilename = 'current';
const finalizedNameMatch = new RegExp('^enebular-([0-9]+)-([0-9]+)$');

function debug(msg, ...args) {
  if (process.env.DEBUG_LOG) {
    console.log("enebular-log: " + msg, ...args);
  }
}

function error(msg, ...args) {
  console.error("enebular-log: " + msg, ...args);
}

let Enebular = exports.Enebular = function(options) {
  Transport.call(this, options);
  options = options || {};

  //

  this.cachePath      = options.cachePath     || '/tmp/enebular-log-cache';
  this.sendInterval   = 15;
  this.sendSize       = 1024;//100 * 1024;
  this.maxCacheSize   = 2*1024;//5 * 1024 * 1024;
  this.maxUploadSize  = 256;//1 * 1024 * 1024;
  this._agentManager   = options.agentManager;

  this._currentPath   = `${this.cachePath}/${currentFilename}`

  try {
    if (!fs.existsSync(this.cachePath)) {
      fs.mkdirSync(this.cachePath);
    }
  } catch (err) {
    error('Failed to create log cache directory: ' + err);
  }

  this._active = false;
  this._sending = false;
  this._sendingFile = null;
  this._closed = false;

  this._updateSendInterval();
};

util.inherits(Enebular, Transport);

Enebular.prototype.name = 'enebular';

Enebular.prototype.log = function(level, msg, meta, callback) {
  let self = this;

  if (!this._active) {
    return;
  }

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

Enebular.prototype._updateSendInterval = function() {

  if (this._intervalID) {
    clearInterval(this._intervalID);
    this._intervalID = null;
  }

  if (this._active) {
    this._intervalID = setInterval(() => {
      this._handleTimeTrigger()
    }, this.sendInterval*1000);
  }
}

Enebular.prototype._appendOutput = function(output, callback) {
  let self = this;

  if (!fs.existsSync(this.cachePath)) {
    let msg = "Log cache directory doesn't exist: " + this.cachePath;
    return callback(new Error(msg));
  }

  let prefix = (fs.existsSync(this._currentPath)) ? ',\n' : '[\n';
  output = prefix + output;
  let outputSize = output.length;

  let ok = this._shrinkCacheToFit(outputSize);
  if (!ok) {
      let msg = "Failed to shrink cache enough";
      error(msg);
      return callback(new Error(msg));
  }

  if (fs.existsSync(this._currentPath)) {
    let stats = fs.statSync(this._currentPath);
    if (stats.size + outputSize >= this.maxUploadSize) {
      this._finalizeCurrent();
    }
  }

  try {
    fs.appendFileSync(this._currentPath, output);

    self.emit('logged');
    callback(null, true);

    if (this._cacheSize() > this.sendSize) {
      debug('Send size reached');
      this._updateSendInterval();
      this._send();
    }
  } catch (err) {
    callback(err);
  }
}

Enebular.prototype._cacheSize = function() {

  let cachedSize = 0;

  try {

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

  } catch (err) {
    error('Failed to correctly determine cache size: ' + err);
  }

  return cachedSize;
}

Enebular.prototype._getOrderedFinalized = function() {

  if (!fs.existsSync(this.cachePath)) {
    return null;
  }

  let filenames;
  try {
    filenames = fs.readdirSync(this.cachePath);
  } catch (err) {
    error('Failed to get cache directory content: ' + err);
    return null;
  }

  filenames = filenames.filter(filename => filename.match(finalizedNameMatch));
  filenames.sort((a,b) => {
    let aMatch = a.match(finalizedNameMatch);
    let bMatch = b.match(finalizedNameMatch);
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

Enebular.prototype._shrinkCacheToFit = function(newLength) {
  const maxAttempts = 100;
  let attempts = 0;

  while ((this._cacheSize() + newLength >= this.maxCacheSize) &&
      (attempts++ < maxAttempts)) {
    let ok = this._shrinkCache();
    if (!ok) {
      return false;
    }
  }
  if (attempts > maxAttempts) {
      return false;
  }

  return true;
}

Enebular.prototype._shrinkCache = function() {

  debug('Shrinking cache...');

  let target = null;

  let filenames = this._getOrderedFinalized();
  if (filenames && filenames.length > 0) {
      target = filenames[0];
      if (target === this._sendingFile) {
        debug(`Excluding log currently being sent from cache shrink (${target})`);
        target = (filenames.length > 1) ? filenames[1] : null;
      }
  }

  if (!target) {
    target = this._currentPath;
  }

  const filePath = `${this.cachePath}/${target}`;
  if (fs.existsSync(filePath)) {
    debug(`Removing: ${target}`);
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      error('Failed to remove file from cache: ' + err);
      return false;
    }
    return true;
  }

  return false;
}

Enebular.prototype._finalizeCurrent = function() {

  try {

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
      error('Failed to find unique name for log file');
      return;
    }

    debug(`Finalizing current to: ${finalizedName}`);

    fs.appendFileSync(this._currentPath, '\n]');

    fs.renameSync(this._currentPath, finalizedPath);

  } catch (err) {
    error('Failed to finalize current log: ' + err);
  }
}

Enebular.prototype._sendFinialized = async function() {

  let filenames = this._getOrderedFinalized();
  if (!filenames || filenames.length < 1) {
    return;
  }

  debug(`Sending ${filenames.length} logs...`);

  for (let filename of filenames) {

    try {

      const filePath = `${this.cachePath}/${filename}`;

      /**
       * Don't use async/callbacks for fs.exists here to keep the exists check
       * and the assignment of 'sendingFile' atomic.
       */
      if (!fs.existsSync(filePath)) {
        debug(`Upload target log no longer exists (${filename})`);
        continue;
      }
      this._sendingFile = filename;

      const stats = await statAsync(filePath);
      if (stats.size < 1) {
        debug('Removing empty log: ' + filename);
      } else {
        debug(`Sending: ${filename} (${stats.size}B)`);
        await this._agentManager.sendLog(filePath);
      }

      await unlinkAsync(filePath);

      this._sendingFile = null;

      debug(`Sent: ${filename}`);

    } catch (err) {
      error('Failed to send log: ' + err);
    }

  }

}

Enebular.prototype._send = async function() {

  debug('Starting logs send...');

  if (this._sending) {
    debug('Already sending logs');
    return;
  }

  this._sending = true;

  await this._sendFinialized();
  await this._finalizeCurrent();
  await this._sendFinialized();

  this._sending = false;

  debug('Logs send complete');
}

Enebular.prototype._handleTimeTrigger = function() {
  debug('Send time trigger...');
  this._send();
}

Enebular.prototype.activate = async function(active) {
  this._active = active;
  this._updateSendInterval();
};

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
