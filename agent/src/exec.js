import type DockerManager from './docker-manager'

export default class Exec {
  _dockerMan: DockerManager
  _id: string

  config: Object
  state: string
  changeTs: number
  changeErrMsg: ?string
  pendingUpdateId: ?string
  pendingChange: ?string // (deploy|remove)
  pendingConfig: ?Object
  updateAttemptCount: number = 0
  lastAttemptedUpdateId: ?string

  constructor(id, dockerMan: DockerManager) {
    this._id = id
    this._dockerMan = dockerMan
    this.changeTs = Date.now()
  }

  _debug(msg: string, ...args: Array<mixed>) {
    this._dockerMan.debug(msg, ...args)
  }

  _info(msg: string, ...args: Array<mixed>) {
    this._dockerMan.info(msg, ...args)
  }

  _error(msg: string, ...args: Array<mixed>) {
    this._dockerMan.error(msg, ...args)
  }

  id(): string {
    return this._id
  }

  serialize(): {} {
    return {
      id: this._id,
      updateId: this.updateId,
      state: this.state,
      updateAttemptCount: this.updateAttemptCount,
      lastAttemptedUpdateId: this.lastAttemptedUpdateId,
      changeTs: this.changeTs,
      changeErrMsg: this.changeErrMsg,
      config: this.config,
      pendingChange: this.pendingChange,
      pendingUpdateId: this.pendingUpdateId,
      pendingConfig: this.pendingConfig
    }
  }
}
