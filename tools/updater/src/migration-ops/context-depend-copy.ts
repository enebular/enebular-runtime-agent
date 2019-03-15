import { Copy, CopyState } from './copy'
import { MigrateContext } from '../migrator'

export class ContextDependCopy extends Copy {
  protected _updatePathCallback: (
    context: MigrateContext,
    copyOps: ContextDependCopy
  ) => void

  public constructor(
    name: string,
    pathFunc: (context: MigrateContext, copyOps: ContextDependCopy) => void,
    optional = false
  ) {
    super(name, '', '', optional)
    this.currentState.type = 'context-depend-copy'
    this.desiredState.type = 'context-depend-copy'
    this._updatePathCallback = pathFunc
  }

  public async do(context: MigrateContext): Promise<void> {
    this._updatePathCallback(context, this)
    await super.do(context)
  }

  public updatePath(src: string, dst: string): void {
    ;(this.currentState as CopyState).path = src // need the semicolon
    ;(this.desiredState as CopyState).path = dst
  }
}

export default ContextDependCopy
