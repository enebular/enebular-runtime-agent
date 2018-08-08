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

  async createThing(configSavePath: ?string, thingName: ?string) {
    if (!thingName) {
      throw('thingName is required.')
    }

    console.log('Creating thing: ' + thingName)
    configSavePath = configSavePath || path.resolve('../../ports/awsiot')

    const iot = new IoT({
      apiVersion: '2015-05-28',
      accessKeyId: this._awsAccessKeyId,
      secretAccessKey: this._awsSecretAccessKey,
      region: this._awsIotRegion
    })

    let endPoint
    try {
      endPoint = await iot.describeEndpoint().promise()
    } catch (err) {
      throw('Get AWS IoT unique endpoint failed. Please check your aws iot configuration.')
    }

    let keysAndCert
    try {
      keysAndCert = await iot
        .createKeysAndCertificate({ setAsActive: true })
        .promise()
    } catch (err) {
      throw('Create key pairs and certificate failed.')
    }

    const policyName = 'enebular_policy'
    try {
      await iot.getPolicy({ policyName: policyName }).promise()
    } catch (err) {
      console.log('Failed to get policy, try to create a new one using enebular default policy.')
      try {
        await iot
          .createPolicy({
            policyName: policyName,
            policyDocument: fs.readFileSync(`./${policyName}.json`, 'utf8')
          })
          .promise()
      } catch (err) {
        throw('Failed to create policy.')
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
      throw('Attach policy to certificate failed.')
    }

    try {
      await iot.createThing({ thingName: thingName }).promise()
    } catch (err) {
      throw('Create thing failed.')
    }

    try {
      await iot
        .attachThingPrincipal({
          thingName: thingName,
          principal: keysAndCert.certificateArn
        })
        .promise()
    } catch (err) {
      throw('Attach thing to certificate failed.')
    }

    return await this._save(
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
        throw("Certificate path can't be a existing file")
      }
    } catch (err) {
      try {
        fs.mkdirSync(certsPath)
      } catch (err) {
        throw("Make directory failed.")
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
      throw("Save certificate failed.")
    }

    try {
      fs.writeFileSync(
        path.resolve(configSavePath, privateKeyRelativePath),
        privateKey,
        'utf8'
      )
    } catch (err) {
      throw("Save privateKey failed.")
    }

    try {
      await this._download(
        'https://www.symantec.com/content/en/us/enterprise/verisign/roots/VeriSign-Class%203-Public-Primary-Certification-Authority-G5.pem',
        path.resolve(configSavePath, rootCertRelativePath)
      )
    } catch (err) {
      throw('Download AWS root certificate failed.')
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
      throw("Save config file failed.")
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
