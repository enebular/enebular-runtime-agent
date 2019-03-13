import Migrator from '../migrator'

export interface MigrationState {
  type: string
}

export abstract class Migration {
  protected _name: string
  protected _optional: boolean
  protected _done: boolean
  protected _currentState: MigrationState
  protected _desiredState: MigrationState

  public reverse?: (migrator: Migrator) => Promise<void> | void

  protected constructor(
    name: string,
    currentState: MigrationState,
    desiredState: MigrationState,
    optional: boolean
  ) {
    this._done = false
    this._name = name
    this._currentState = currentState
    this._desiredState = desiredState
    this._optional = optional
  }

  public get optional(): boolean {
    return this._optional
  }

  public get name(): string {
    return this._name
  }

  public get done(): boolean {
    return this._done
  }

  public set done(done: boolean) {
    this._done = done
  }

  public get desiredState(): MigrationState {
    return this._desiredState
  }

  public set currentState(state: MigrationState) {
    this._currentState = state
  }

  public abstract do(migrator: Migrator): Promise<void> | void
}

export default Migration
