// __mocks__/winston.js
let enableFlag:Boolean = true

const winston = jest.genMockFromModule('winston');

function debug(msg: string, ...args: Array<mixed>) {
    if(enableFlag) {
        console.log(msg, ...args)
    }
}

function info(msg: string, ...args: Array<mixed>) {
    if(enableFlag) {
        console.log(msg, ...args)
    }
}

function warn(msg: string, ...args: Array<mixed>) {
    if(enableFlag) {
        console.log(msg, ...args)
    }
}

function error(msg: string, ...args: Array<mixed>) {
    if(enableFlag) {
        console.log(msg, ...args)
    }
}

function enable(flag) {
    enableFlag = flag
}

winston.debug = debug;
winston.info = info;
winston.warn = warn;
winston.error = error;
winston.enable = enable

module.exports = winston;