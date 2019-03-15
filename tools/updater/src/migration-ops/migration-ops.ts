import { MigrateContext } from '../migrator'

export interface MigrationOpsState {
  type: string
}

export abstract class MigrationOps {
  protected _name: string
  protected _optional: boolean
  protected _done: boolean
  protected _currentState: MigrationOpsState
  protected _desiredState: MigrationOpsState

  public reverse?: () => Promise<void> | void

  protected constructor(
    name: string,
    currentState: MigrationOpsState,
    desiredState: MigrationOpsState,
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

  public get desiredState(): MigrationOpsState {
    return this._desiredState
  }

  public set desiredState(state: MigrationOpsState) {
    this._desiredState = state
  }

  public get currentState(): MigrationOpsState {
    return this._currentState
  }

  public set currentState(state: MigrationOpsState) {
    this._currentState = state
  }

  public abstract do(context: MigrateContext): Promise<void> | void
}

export default MigrationOps
