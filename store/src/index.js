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
    archive.finalize();
    return this.savePackage(archive);
  }

  async savePackage(pkgStream) {
    return pkgStream;
  }

}
