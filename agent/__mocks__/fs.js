// __mocks__/fs.js
const fs = jest.genMockFromModule('fs');

function readdirSync(directoryPath) {
  return
}

function writeFileSync(path, data, options) {
  return
}

fs.readdirSync = readdirSync;
fs.readdirSync = writeFileSync;

module.exports = fs;