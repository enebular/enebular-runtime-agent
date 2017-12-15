/* @flow */

import util from 'util';
import winston from 'winston';
import common from 'winston/lib/winston/common';

const Transport = winston.Transport;

let Enebular = exports.Enebular = function (options) {
  Transport.call(this, options);
  options = options || {};

  //

  this.todo        = options.todo        || false;
};

util.inherits(Enebular, Transport);

Enebular.prototype.name = 'enebular';

Enebular.prototype.log = function (level, msg, meta, callback) {
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

  console.log("output: " + output);

  self.emit('logged');
  callback(null, true);
};

Enebular.prototype.close = function() {
  //

  this.emit('closed');
};
