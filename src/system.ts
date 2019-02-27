import Utils from './utils'
import Log from './log'

export default class System {
  private _log?: Log

  public set log(log: Log) {
    this._log = log
  }

  public async serviceCtl(name: string, action: string): Promise<boolean> {
    try {
      await Utils.spawn('service', [name, action], this._log)
    } catch (err) {
      throw new Error(`Failed to ${action} ${name}:\n${err.message}`)
    }
    return true
  }

  public async replaceDirWithBackup(
    from: string,
    to: string,
    backup: string
  ): Promise<boolean> {
    try {
      await Utils.spawn('mv', [to, backup], this._log)
    } catch (err) {
      throw new Error(`Failed to move ${to} to ${backup}:\n${err.message}`)
    }

    try {
      await Utils.spawn('mv', [from, to], this._log)
    } catch (err) {
      throw new Error(`Failed to move ${from} to ${to}:\n${err.message}`)
    }
    return true
  }
}
