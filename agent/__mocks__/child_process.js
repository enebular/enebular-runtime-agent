// __mocks__/child_process.js

const childProcess = jest.genMockFromModule('child_process');

// A custom version of `readdirSync` that reads from the special mocked out
// file list set via __setMockFiles
function spawn(command, args, options) {

}

function exec(command) {

}

function execSync(command) {

}

childProcess.spawn = spawn;
childProcess.exec = exec;
childProcess.execSync = execSync;

module.exports = childProcess;