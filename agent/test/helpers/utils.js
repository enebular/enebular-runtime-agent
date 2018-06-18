export default class Utils {
  static randomString(method) {
    return Math.random().toString(36).substr(2, 10);
  }
}
