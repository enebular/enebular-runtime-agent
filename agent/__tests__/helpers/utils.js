import crypto from 'crypto'

const fsex = require('fs-extra');
const fs = require('fs');
const path = require('path');

export function deleteDir(dir) {
    console.log('deleteDir:' + dir)
    fsex.removeSync(dir)
}

export function deleteFile(file) {
    try {
        fs.unlinkSync(file);
    } catch (error) {
        return error;
    }
}

export async function getFileObj(fileName) {
    const filePath = path.resolve(__dirname, `../data/${fileName}`)
    const data = fs.readFileSync(filePath, 'utf8')
    const fileSize = data.length
    const fileIintegrity = await _getIntegrity(filePath)

    let fileObj = {
        filename: fileName,
        integrity: fileIintegrity,
        size: fileSize
    }

//    console.log('fileObj: ' + JSON.stringify(fileObj, null, 2))

    return fileObj
}

async function _getIntegrity(path) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256')
      const file = fs.createReadStream(path)
      file.on('data', data => {
        hash.update(data)
      })
      file.on('end', () => {
        const digest = hash.digest('base64')
        resolve(digest)
      })
      file.on('error', err => {
        reject(err)
      })
    })
  }