import archiver from 'archiver';

export default class PackageStore {

  async createPackage(params) {
    const archive = archiver('zip');
    if (params.flows) {
      archive.append(JSON.stringify(params.flows), { name: '.node-red-config/flows.json' });
    }
    if (params.creds) {
      archive.append(JSON.stringify(params.creds), { name: '.node-red-config/flows_cred.json' });
    }
    if (params.packages) {
      archive.append(JSON.stringify({
        name: "enebular-agent-dynamic-deps",
        version: "0.0.1",
        dependencies: params.packages
      }), { name: '.node-red-config/dynamic-deps/package.json' });
    }
    archive.finalize();
    return this.savePackage(archive);
  }

  async savePackage(pkgStream) {
    return pkgStream;
  }

}
