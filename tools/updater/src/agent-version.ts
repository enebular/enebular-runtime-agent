export default class AgentVerion {
  private _major: number
  private _minor: number
  private _patch: number

  public constructor(major: number, minor: number, patch: number) {
    this._major = major
    this._minor = minor
    this._patch = patch
  }

  public get major(): number {
    return this._major
  }

  public get minor(): number {
    return this._minor
  }

  public get patch(): number {
    return this._patch
  }

  public static parse(version: string): AgentVerion | undefined {
    const versionNumbers = version.split('.')
    if (versionNumbers.length != 3) return undefined
    let major, minor, patch
    if (isNaN((major = parseInt(versionNumbers[0])))) return undefined
    if (isNaN((minor = parseInt(versionNumbers[1])))) return undefined
    if (isNaN((patch = parseInt(versionNumbers[2])))) return undefined

    return new AgentVerion(major, minor, patch)
  }

  public greaterThan(version: AgentVerion): boolean {
    if (this._major < version.major) return false
    else if (this._major == version.major && this._minor < version.minor)
      return false
    else if (this._minor == version.minor && this._patch <= version._patch)
      return false
    return true
  }

  public lessThan(version: AgentVerion): boolean {
    return !this.greaterThan(version) && !this.equals(version)
  }

  public equals(version: AgentVerion): boolean {
    return (
      version.major == this._major &&
      version.minor == this._minor &&
      version.patch == this._patch
    )
  }

  public toString(): string {
    return `${this._major}.${this._minor}.${this._patch}`
  }
}
