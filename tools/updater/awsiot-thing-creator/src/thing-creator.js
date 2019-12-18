/* @flow */
import IoT from 'aws-sdk/clients/iot'
import path from 'path'
import http from 'https'
import fs from 'fs'

export type ThingCreatorConfig = {
  awsAccessKeyId: ?string,
  awsSecretAccessKey: ?string,
  awsIotRegion: ?string
}

export default class ThingCreator {
  _awsSecretAccessKey: ?string
  _awsAccessKeyId: ?string
  _awsIotRegion: ?string

  constructor(config: ThingCreatorConfig) {
    this._awsAccessKeyId = config.awsAccessKeyId
    this._awsSecretAccessKey = config.awsSecretAccessKey
    this._awsIotRegion = config.awsIotRegion
  }

  async _thingExists(iot: IoT, thingName: string): Promise<boolean> {
    try {
      await iot.describeThing({ thingName: thingName }).promise()
    } catch (err) {
      if (err.code === 'ResourceNotFoundException') {
        return false
      }
      throw new Error(
        `Failed to check existence of ${thingName}, reason: ${err.message}`
      )
    }
    return true
  }

  async createThing(configSavePath: ?string, thingName: ?string) {
    if (!thingName) {
      throw new Error('thingName is required.')
    }

    console.log('Creating thing: ' + thingName)
    console.log('path: ' + configSavePath)

    const iot = new IoT({
      apiVersion: '2015-05-28',
      accessKeyId: this._awsAccessKeyId,
      secretAccessKey: this._awsSecretAccessKey,
      region: this._awsIotRegion
    })

    if (await this._thingExists(iot, thingName)) {
      throw new Error(
        `${thingName} already exists. Please choose another thing name.`
      )
    }

    let endPoint
    try {
      endPoint = await iot
        .describeEndpoint({ endpointType: 'iot:Data-ATS' })
        .promise()
    } catch (err) {
      throw new Error(
        `Get AWS IoT unique endpoint failed. Please check your aws iot configuration, reason: ${
          err.message
        }`
      )
    }

    let keysAndCert
    try {
      keysAndCert = await iot
        .createKeysAndCertificate({ setAsActive: true })
        .promise()
    } catch (err) {
      throw new Error(
        `Create key pairs and certificate failed, reason: ${err.message}`
      )
    }

    const policyName = 'enebular_policy'
    try {
      await iot.getPolicy({ policyName: policyName }).promise()
    } catch (err) {
      console.log('Failed to find enebular_policy, creating enebular_policy...')
      try {
        await iot
          .createPolicy({
            policyName: policyName,
            policyDocument: fs.readFileSync(`./${policyName}.json`, 'utf8')
          })
          .promise()
      } catch (err) {
        throw new Error(`Failed to create policy, reason: ${err.message}`)
      }
    }

    try {
      await iot
        .attachPrincipalPolicy({
          policyName: policyName,
          principal: keysAndCert.certificateArn
        })
        .promise()
    } catch (err) {
      throw new Error(
        `Attach policy to certificate failed, reason: ${err.message}`
      )
    }

    try {
      await iot.createThing({ thingName: thingName }).promise()
    } catch (err) {
      throw new Error(`Create thing failed, reason: ${err.message}`)
    }

    try {
      await iot
        .attachThingPrincipal({
          thingName: thingName,
          principal: keysAndCert.certificateArn
        })
        .promise()
    } catch (err) {
      throw new Error(
        `Attach thing to certificate failed, reason: ${err.message}`
      )
    }

    return this._save(
      configSavePath,
      thingName,
      endPoint.endpointAddress,
      keysAndCert.certificatePem,
      keysAndCert.keyPair.PrivateKey
    )
  }

  async _save(
    configSavePath: string,
    thingName: string,
    endpointAddress: string,
    certificatePem: string,
    privateKey: string
  ) {
    const certsPath = configSavePath + '/certs'
    try {
      const stat = fs.lstatSync(certsPath)
      if (!stat.isDirectory()) {
        throw new Error("Certificate path can't be a existing file")
      }
    } catch (err) {
      try {
        fs.mkdirSync(certsPath)
      } catch (err) {
        throw new Error('Make directory failed.')
      }
    }

    const rootCertRelativePath = './certs/root.pem'
    const clientCertRelativePath = `./certs/${thingName}.crt.pem`
    const privateKeyRelativePath = `./certs/${thingName}-private.pem`

    try {
      fs.writeFileSync(
        path.resolve(configSavePath, clientCertRelativePath),
        certificatePem,
        'utf8'
      )
    } catch (err) {
      throw new Error('Save certificate failed.')
    }

    try {
      fs.writeFileSync(
        path.resolve(configSavePath, privateKeyRelativePath),
        privateKey,
        'utf8'
      )
    } catch (err) {
      throw new Error('Save privateKey failed.')
    }

    try {
      await this._download(
        'https://www.amazontrust.com/repository/AmazonRootCA1.pem',
        path.resolve(configSavePath, rootCertRelativePath)
      )
    } catch (err) {
      throw new Error('Download AWS root certificate failed.')
    }

    const data = JSON.stringify(
      {
        host: endpointAddress,
        port: 8883,
        clientId: thingName,
        thingName: thingName,
        caCert: rootCertRelativePath,
        clientCert: clientCertRelativePath,
        privateKey: privateKeyRelativePath,
        topic: `aws/things/${thingName}/shadow/update`
      },
      null,
      4
    )
    try {
      fs.writeFileSync(configSavePath + '/config.json', data, 'utf8')
    } catch (err) {
      throw new Error('Save config file failed.')
    }
    console.log(
      `Thing ${thingName} created successfully. Config saved to ${configSavePath}/config.json`
    )
  }

  _download(url: string, dest: string) {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(dest)
      const request = http.get(url, response => {
        if (response.statusCode === 200) {
          response.pipe(file)
        } else {
          file.close()
          fs.unlink(dest, () => {})
          reject(
            new Error(
              `Server responded with ${response.statusCode}: ${
                response.statusMessage
              }`
            )
          )
        }
      })
      request.on('error', err => {
        file.close()
        fs.unlink(dest, () => {})
        reject(err)
      })
      file.on('finish', () => {
        resolve()
      })
      file.on('error', err => {
        file.close()
        fs.unlink(dest, () => {})
        reject(err)
      })
    })
  }
}
