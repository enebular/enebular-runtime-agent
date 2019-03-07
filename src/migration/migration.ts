import Migrator from '../migrator'

export interface MigrationState {
  type: string
}

export abstract class Migration {
  protected _name: string
  protected _optional: boolean
  protected _currentState: MigrationState
  protected _deserveState: MigrationState

  public reverse?: (migrator: Migrator) => Promise<void> | void

  protected constructor(
    name: string,
    currentState: MigrationState,
    deserveState: MigrationState,
    optional: boolean
  ) {
    this._name = name
    this._currentState = currentState
    this._deserveState = deserveState
    this._optional = optional
  }

  public get optional(): boolean {
    return this._optional
  }

  public get name(): string {
    return this._name
  }

  public get deserveState(): MigrationState {
    return this._deserveState
  }

  public set currentState(state: MigrationState) {
    this._currentState = state
  }

  public abstract _do(migrator: Migrator): Promise<void> | void
}

export default Migration
