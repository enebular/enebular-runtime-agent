export default class TaskError extends Error {
  public code: string
  public info?: Record<string, any>

  constructor(code: string, message: string, info?: Record<string, any>) {
    super(message)
    this.code = code
    this.info = info
  }
}
