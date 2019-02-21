
export enum LogLevel {
  ERROR = 1,
  INFO, 
  DEBUG,
}

export default class Logger {
  private _level: LogLevel
  private _enable: boolean

  public constructor(level: string, enable: boolean) {
    this._level = this._string2Level(level)
    this._enable = enable
  } 

  public setLevel(level: string) {
    this._level = this._string2Level(level)
  }

  private _string2Level(str: string): LogLevel {
    if (str.toLowerCase() == 'error')
      return LogLevel.ERROR
    else if (str.toLowerCase() == 'debug')
      return LogLevel.DEBUG
    else
      return LogLevel.INFO
  }

  private _log(msg: string | object) {
    console.log(msg)
  }

  public error(msg: string | object) {
    if (this._enable)
      this._log(msg)
  }

  public info(msg: string | object) {
    if (this._enable && this._level > LogLevel.ERROR)
      this._log(msg)
  }

  public debug(msg: string | object) {
    if (this._enable && this._level > LogLevel.INFO)
      this._log(msg)
  }
}
