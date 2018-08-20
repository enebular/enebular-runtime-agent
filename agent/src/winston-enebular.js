/* @flow */

import util from 'util'
import fs from 'fs'
import winston from 'winston'
import common from 'winston/lib/winston/common'
import type AgentManagerMediator from './agent-manager-mediator'

export type WinstonEnebularConfig = {
  sendInterval?: number,
  sendSize?: number
}

const statAsync = util.promisify(fs.stat)
const unlinkAsync = util.promisify(fs.unlink)

const Transport = winston.Transport

const currentFilename = 'current'
const finalizedNameMatch = new RegExp('^enebular-([0-9]+)-([0-9]+)$')
/**
 * maxUploadChunkSize is also our cache management chunk size.
 */
const maxUploadChunkSize = 256 * 1024

function debug(msg: string, ...args: Array<mixed>) {
  if (process.env.DEBUG_LOG) {
    console.log('enebular-log: ' + msg, ...args)
  }
}

function error(msg: string, ...args: Array<mixed>) {
  console.error('enebular-log: ' + msg, ...args)
}

/**
 * The enebular transport supports a number of configuration options, as
 * explained below. Note that there is some interplay between some of the
 * options in terms of how they combine to affect runtime behavior.
 *
 * Options:
 *  - cachePath: The directory path to use for log caching
 *  - maxCacheSize: The max size of the log cache
 *  - sendInterval: The time interval at which to trigger the uploading of
 *      cached log events. The interval timer is reset when the sendInterval is
 *      changed or when a send is triggered due to sendSize being reached.
 *  - sendSize: The size at which to trigger uploading of cache log events.
 *  - maxSizePerInterval: The max total size of logged events allowed in one
 *      sendInterval
 */
let Enebular = (exports.Enebular = function(options: any) {
  Transport.call(this, options)
  options = options || {}

  this._cachePath = options.cachePath || '/tmp/enebular-log-cache'
  this._maxCacheSize = options.maxCacheSize || 2 * 1024 * 1024
  this._currentPath = `${this._cachePath}/${currentFilename}`
  this._sendInterval = options.sendInterval || 30
  this._sendSize = options.sendSize || 100 * 1024
  this._maxSizePerInterval = options.maxSizePerInterval || 100 * 1024

  this._agentManager = null
  this._active = false
  this._sending = false
  this._sendingFile = null
  this._closed = false
  this._intervalTotal = 0

  try {
    if (!fs.existsSync(this._cachePath)) {
      fs.mkdirSync(this._cachePath)
    }
  } catch (err) {
    error('Failed to create log cache directory: ' + err)
  }

  debug('cachePath: ' + this._cachePath)
  debug('maxCacheSize: ' + this._maxCacheSize)
  debug('sendInterval: ' + this._sendInterval)
  debug('sendSize: ' + this._sendSize)
  debug('maxSizePerInterval: ' + this._maxSizePerInterval)

  this._updateSendInterval()
})

util.inherits(Enebular, Transport)

Enebular.prototype.name = 'enebular'

Enebular.prototype.log = function(level, msg, meta, callback) {
  let output = common.log({
    colorize: false,
    json: true,
    level: level,
    message: msg,
    meta: meta,
    stringify: true,
    timestamp: true,
    prettyPrint: false,
    raw: false,
    label: '',
    depth: null,
    formatter: this.formatter,
    humanReadableUnhandledException: this.humanReadableUnhandledException // ?
  })

  this._appendOutput(output, callback)
}

Enebular.prototype._appendOutput = function(output, callback) {
  let self = this

  if (!fs.existsSync(this._cachePath)) {
    let msg = "Log cache directory doesn't exist: " + this._cachePath
    return callback(new Error(msg))
  }

  /**
   * We need to do the size related adjustments based on an assumed prefix
   * length as the adjustments could result in the removal of 'current', which
   * would change what the prefix should be.
   */
  const prefixLength = 2
  const finalizeSuffixLength = 2
  if (
    this._intervalTotal + output.length + prefixLength >=
    this._maxSizePerInterval - finalizeSuffixLength
  ) {
    debug('max-size-per-interval reached so ignoring new log event')
    return callback(null, true)
  }

  let outputSize = output.length + prefixLength
  let ok = this._shrinkCacheToFit(outputSize)
  if (!ok) {
    let msg = 'Failed to shrink cache enough'
    error(msg)
    return callback(new Error(msg))
  }

  if (fs.existsSync(this._currentPath)) {
    let stats = fs.statSync(this._currentPath)
    if (stats.size + outputSize >= maxUploadChunkSize) {
      debug('Max upload chunk size reached')
      this._finalizeCurrent()
    }
  }

  let prefix = fs.existsSync(this._currentPath) ? ',\n' : '[\n'
  output = prefix + output
  outputSize = output.length

  try {
    fs.appendFileSync(this._currentPath, output)

    this._intervalTotal += outputSize

    self.emit('logged')
    callback(null, true)

    if (this._cacheSize() > this._sendSize) {
      debug('Send size reached')
      this._updateSendInterval()
      this._send()
    }
  } catch (err) {
    callback(err)
  }
}

Enebular.prototype._cacheSize = function() {
  let cachedSize = 0

  try {
    /* current file */
    if (fs.existsSync(this._currentPath)) {
      const stats = fs.statSync(this._currentPath)
      cachedSize += stats.size
    }

    /* finalized files */
    let filenames = fs.readdirSync(this._cachePath)
    for (let filename of filenames) {
      if (!filename.match(finalizedNameMatch)) {
        continue
      }
      const filePath = `${this._cachePath}/${filename}`
      const stats = fs.statSync(filePath)
      cachedSize += stats.size
    }
  } catch (err) {
    error('Failed to correctly determine cache size: ' + err)
  }

  return cachedSize
}

Enebular.prototype._getOrderedFinalized = function() {
  if (!fs.existsSync(this._cachePath)) {
    return null
  }

  let filenames
  try {
    filenames = fs.readdirSync(this._cachePath)
  } catch (err) {
    error('Failed to get cache directory content: ' + err)
    return null
  }

  filenames = filenames.filter(filename => filename.match(finalizedNameMatch))
  filenames.sort((a: string, b: string) => {
    const aMatch = a.match(finalizedNameMatch)
    const bMatch = b.match(finalizedNameMatch)
    if (!aMatch || !bMatch) {
      return 0
    }
    if (aMatch[1] < bMatch[1]) {
      return -1
    }
    if (aMatch[1] > bMatch[1]) {
      return 1
    }
    if (aMatch[2] < bMatch[2]) {
      return -1
    }
    if (aMatch[2] > bMatch[2]) {
      return 1
    }
    return 0
  })

  return filenames
}

Enebular.prototype._shrinkCacheToFit = function(newLength) {
  const maxAttempts = 100
  let attempts = 0

  while (
    this._cacheSize() + newLength >= this._maxCacheSize &&
    attempts++ < maxAttempts
  ) {
    let ok = this._shrinkCache()
    if (!ok) {
      return false
    }
  }
  if (attempts > maxAttempts) {
    return false
  }

  return true
}

Enebular.prototype._shrinkCache = function() {
  debug('Shrinking cache...')

  let target = null

  let filenames = this._getOrderedFinalized()
  if (filenames && filenames.length > 0) {
    target = filenames[0]
    if (target === this._sendingFile) {
      debug(`Excluding log currently being sent from cache shrink (${target})`)
      target = filenames.length > 1 ? filenames[1] : null
    }
  }

  if (!target) {
    target = currentFilename
  }

  const filePath = `${this._cachePath}/${target}`
  if (fs.existsSync(filePath)) {
    debug(`Removing: ${target}`)
    try {
      fs.unlinkSync(filePath)
    } catch (err) {
      error('Failed to remove file from cache: ' + err)
      return false
    }
    return true
  }

  return false
}

function nameTimestamp(): string {
  function pad(number: number, length: number): string {
    let str = number.toString()
    while (str.length < length) {
      str = '0' + str
    }
    return str
  }

  const now = new Date()

  return (
    now.getUTCFullYear().toString() +
    pad(now.getUTCMonth() + 1, 2) +
    pad(now.getUTCDate(), 2) +
    pad(now.getUTCHours(), 2) +
    pad(now.getUTCMinutes(), 2) +
    pad(now.getUTCSeconds(), 2) +
    pad(now.getUTCMilliseconds(), 3)
  )
}

Enebular.prototype._finalizeCurrent = function() {
  try {
    if (!fs.existsSync(this._currentPath)) {
      return
    }

    let finalizedName = ''
    let finalizedPath = ''
    let cnt = 0
    const maxCnt = 99
    while (cnt <= maxCnt) {
      finalizedName = `enebular-${nameTimestamp()}-${cnt}`
      finalizedPath = `${this._cachePath}/${finalizedName}`
      if (!fs.existsSync(finalizedPath)) {
        break
      }
      cnt++
    }
    if (cnt >= maxCnt) {
      error('Failed to find unique name for log file')
      return
    }

    debug(`Finalizing current to: ${finalizedName}`)

    fs.appendFileSync(this._currentPath, '\n]')

    fs.renameSync(this._currentPath, finalizedPath)
  } catch (err) {
    error('Failed to finalize current log: ' + err)
  }
}

Enebular.prototype._sendFinialized = async function() {
  let filenames = this._getOrderedFinalized()
  if (!filenames || filenames.length < 1) {
    return
  }

  debug(`Sending ${filenames.length} logs...`)

  for (let filename of filenames) {
    try {
      const filePath = `${this._cachePath}/${filename}`

      /**
       * Don't use async/callbacks for fs.exists here to keep the exists check
       * and the assignment of 'sendingFile' atomic.
       */
      if (!fs.existsSync(filePath)) {
        debug(`Upload target log no longer exists (${filename})`)
        continue
      }
      this._sendingFile = filename

      const stats = await statAsync(filePath)
      if (stats.size < 1) {
        debug('Removing empty log: ' + filename)
      } else {
        debug(`Sending: ${filename} (${stats.size}B)`)
        await this._agentManager.sendLog(filePath)
      }

      await unlinkAsync(filePath)

      this._sendingFile = null

      debug(`Sent: ${filename}`)
    } catch (err) {
      error('Failed to send log: ' + err)
    }
  }
}

Enebular.prototype._send = async function() {
  debug('Starting logs send...')

  if (!this._active) {
    debug('Not sending logs as not currently active')
    return
  }

  if (!this._agentManager) {
    error('Agent manager not yet set')
    return
  }

  if (this._sending) {
    debug('Already sending logs')
    return
  }

  this._sending = true

  await this._sendFinialized()
  await this._finalizeCurrent()
  await this._sendFinialized()

  this._sending = false

  debug('Logs send complete')
}

Enebular.prototype._handleSendTimeTrigger = function() {
  debug('Send time trigger...')
  this._intervalTotal = 0
  this._send()
}

Enebular.prototype._updateSendInterval = function() {
  if (this._intervalID) {
    clearInterval(this._intervalID)
    this._intervalID = null
  }

  if (this._active) {
    this._intervalID = setInterval(() => {
      this._handleSendTimeTrigger()
    }, this._sendInterval * 1000)
  }
}

Enebular.prototype.activate = async function(active: boolean) {
  this._active = active
  this._updateSendInterval()
}

Enebular.prototype.configure = function(config: WinstonEnebularConfig) {
  if (config.sendInterval) {
    this._sendInterval = config.sendInterval
    this._updateSendInterval()
  }

  if (config.sendSize) {
    this._sendSize = config.sendSize
  }

  debug('sendInterval: ' + this._sendInterval)
  debug('sendSize: ' + this._sendSize)
}

Enebular.prototype.setAgentManager = async function(
  agentManager: AgentManagerMediator
) {
  this._agentManager = agentManager
}

Enebular.prototype.close = async function() {
  if (this._closed) {
    return
  }

  clearInterval(this._intervalID)
  this._closed = true
}

Enebular.prototype.cleanUp = async function() {
  await this._send()
}
