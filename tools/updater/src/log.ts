import * as fs from 'fs'

export enum LogLevel {
  ERROR = 1,
  INFO,
  DEBUG
}

export default class Logger {
  private _level: LogLevel
  private _enable: boolean
  private _logFilePath: string

  public constructor(level: string, enable: boolean, logFilePath: string) {
    this._level = this._string2Level(level)
    this._enable = enable
    this._logFilePath = logFilePath
  }

  public getLogFilePath(): string {
    return this._logFilePath
  }

  public setLevel(level: string): void {
    this._level = this._string2Level(level)
  }

  private _string2Level(str: string): LogLevel {
    if (str.toLowerCase() == 'error') return LogLevel.ERROR
    else if (str.toLowerCase() == 'debug') return LogLevel.DEBUG
    else return LogLevel.INFO
  }

  private _log(msg: string | object): void {
    console.log(msg)
  }

  private _logFile(msg: string | object): void {
    try {
      fs.appendFileSync(this._logFilePath, `${msg}`)
      fs.appendFileSync(this._logFilePath, '\n')
    } catch (err) {
      /* Handle the error */
    }
  }

  public error(msg: string | object): void {
    if (this._enable) this._log(msg)
    this._logFile(msg)
  }

  public info(msg: string | object): void {
    if (this._enable && this._level > LogLevel.ERROR) this._log(msg)
    this._logFile(msg)
  }

  public debug(msg: string | object): void {
    if (this._enable && this._level > LogLevel.INFO) this._log(msg)
    this._logFile(msg)
  }
}
