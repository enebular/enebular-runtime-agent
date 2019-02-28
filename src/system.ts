import Utils from './utils'
import Log from './log'

export interface SystemIf {
  getServiceLogIgnoreError(serviceName: string, lines: number): string

  stopAgent(service: string): Promise<boolean>
  stopNewAgent(service: string): Promise<boolean>
  startAgent(service: string): Promise<boolean>
  startNewAgent(service: string): Promise<boolean>
  flipToNewAgent(
    newAgent: string,
    agent: string,
    agentBackup: string
  ): Promise<boolean>
  flipToOriginalAgent(
    originalAgent: string,
    newAgent: string,
    newAgentBackup: string
  ): Promise<boolean>
  isAgentDead(path: string, user: string): boolean
  isNewAgentDead(path: string, user: string): boolean
}

export class System implements SystemIf {
  private _log: Log

  public constructor(log: Log) {
    this._log = log
  }

  public getServiceLogIgnoreError(serviceName: string, lines: number): string {
    const ret = Utils.execReturnStdout(
      `journalctl -n ${lines} --no-pager -ex -u ${serviceName}`
    )
    return ret ? ret : ''
  }

  public async stopAgent(service: string): Promise<boolean> {
    return this._serviceCtl(service, 'stop')
  }

  public async stopNewAgent(service: string): Promise<boolean> {
    return this._serviceCtl(service, 'stop')
  }

  public async startAgent(service: string): Promise<boolean> {
    return this._serviceCtl(service, 'start')
  }

  public async startNewAgent(service: string): Promise<boolean> {
    return this._serviceCtl(service, 'start')
  }

  private async _serviceCtl(name: string, action: string): Promise<boolean> {
    try {
      await Utils.spawn('service', [name, action], this._log)
    } catch (err) {
      throw new Error(`Failed to ${action} ${name}:\n${err.message}`)
    }
    return true
  }

  public isAgentDead(path: string, user: string): boolean {
    return this._isAgentDead(path, user)
  }

  public isNewAgentDead(path: string, user: string): boolean {
    return this._isAgentDead(path, user)
  }

  private _isAgentDead(path: string, user: string): boolean {
    const info = Utils.dumpAgentInfo(path, user)
    if (!info.systemd) return true
    this._log.debug(
      `enebular-agent status: enabled:${info.systemd.enabled} active:${
        info.systemd.active
      } failed: ${info.systemd.failed}`
    )
    if (!info.systemd.active) {
      this._log.debug('enebular-agent failed to active')
    }
    if (info.systemd.failed) {
      this._log.debug('enebular-agent status is failed')
    }
    return info.systemd.failed || !info.systemd.active ? true : false
  }

  public async flipToNewAgent(
    newAgent: string,
    agent: string,
    agentBackup: string
  ): Promise<boolean> {
    return this._replaceDirWithBackup(newAgent, agent, agentBackup)
  }

  public async flipToOriginalAgent(
    originalAgent: string,
    newAgent: string,
    newAgentBackup: string
  ): Promise<boolean> {
    return this._replaceDirWithBackup(originalAgent, newAgent, newAgentBackup)
  }

  private async _replaceDirWithBackup(
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

export default System
