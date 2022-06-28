const fs = require('fs')
const path = require('path')

module.exports = {
  userDir: __dirname,
  flowFile: 'flows.json',
  verbose: true,
  httpAdminRoot: '/',
  httpNodeRoot: '/',
  storageModule: require('../enebularStorageModule'),
  //credentialSecret: false,
  editorTheme: {
    userMenu: false,
    tours: false,
    page: {
      title: '',
      favicon: path.join(__dirname, 'img', 'favicon.ico'),
      css: path.join(__dirname, 'css', 'index.css')
    },
    header: {
      title: ' ',
      image: path.join(__dirname, 'img', 'enebular_logo.svg')
    },
    deployButton: {
      type: 'simple',
      label: 'Save'
    }
  },
  externalModules: {
    autoInstall: true
  },
}
