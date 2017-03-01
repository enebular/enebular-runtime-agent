export default class PackageStore {

  async createPackage(params) {
    const flowPackage = {};
    if (params.flows) {
      flowPackage.flow = params.flows;
    }
    if (params.creds) {
      flowPackage.cred = params.creds;
    }
    if (params.packages) {
      flowPackage.packages = params.packages;
    }
    const flowPackageJSON = JSON.stringify(flowPackage);
    return this.savePackage(flowPackageJSON);
  }

  async savePackage(data) {
    return data;
  }

}
