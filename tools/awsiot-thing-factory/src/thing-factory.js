/* @flow */
import IoT from 'aws-sdk/clients/iot'
import path from 'path'
import http from 'https'
import fs from 'fs'

export type ThingFactoryConfig = {
  awsAccessKeyId: string,
  awsSecretAccessKey: string,
  awsIotRegion: string
}

export default class ThingFactory {
  _awsSecretAccessKey: string
  _awsAccessKeyId: string
  _awsIotRegion: string

  constructor(config: ThingFactoryConfig) {
    this._awsAccessKeyId = config.awsAccessKeyId
    this._awsSecretAccessKey = config.awsSecretAccessKey
    this._awsIotRegion = config.awsIotRegion
  }

  async createAWSIoTThing(configSavePath: string, thingName: string) {
    if (!thingName) {
      console.log('thingName is required.')
      return false
    }

    configSavePath = configSavePath || path.resolve('../../ports/awsiot')
    console.log('Config saving path is:' + configSavePath)

    const iot = new IoT({
      apiVersion: '2015-05-28',
      accessKeyId: this._awsAccessKeyId,
      secretAccessKey: this._awsSecretAccessKey,
      region: this._awsIotRegion
    })

    let endPoint
    try {
      endPoint = await iot.describeEndpoint().promise()
      console.log(endPoint)
    } catch (err) {
      console.log('Get unique endpoint failed.')
      console.log(err)
      return false
    }

    let keysAndCert
    try {
      keysAndCert = await iot
        .createKeysAndCertificate({ setAsActive: true })
        .promise()
      console.log(keysAndCert)
    } catch (err) {
      console.log('Create key pairs and certificate failed.')
      console.log(err)
      return false
    }

    const policyName = 'enebular_policy'
    let policy
    try {
      policy = await iot.getPolicy({ policyName: policyName }).promise()
      console.log(policy)
    } catch (err) {
      console.log('Failed to get policy, try to create one.')
      try {
        policy = await iot
          .createPolicy({
            policyName: policyName,
            policyDocument: fs.readFileSync(`./${policyName}.json`, 'utf8')
          })
          .promise()
        console.log(policy)
      } catch (err) {
        console.log('Failed to create policy.')
        console.log(err)
        return false
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
      console.log('Attach policy to certificate failed.')
      console.log(err)
      return false
    }

    let thing
    try {
      thing = await iot.createThing({ thingName: thingName }).promise()
      console.log(thing)
    } catch (err) {
      console.log('Create thing failed.')
      console.log(err)
      return false
    }

    try {
      await iot
        .attachThingPrincipal({
          thingName: thingName,
          principal: keysAndCert.certificateArn
        })
        .promise()
    } catch (err) {
      console.log('Attach thing to certificate failed.')
      console.log(err)
      return false
    }

    const ret = this.save(
        configSavePath,
        thingName,
        endPoint.endpointAddress,
        keysAndCert.certificatePem,
        keysAndCert.keyPair.PrivateKey
      )

    if (ret) {
      console.log(
        `Thing ${thingName} created successfully. Config saved to ${configSavePath}/config.json`
      )
    }
    return ret
  }

  async save(
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
        console.log("certificate path can't be a existing file")
        return false
      }
    } catch (err) {
      try {
        fs.mkdirSync(certsPath)
      } catch (err) {
        console.log(err)
        return false
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
      console.log(err)
      return false
    }

    try {
      fs.writeFileSync(
        path.resolve(configSavePath, privateKeyRelativePath),
        privateKey,
        'utf8'
      )
    } catch (err) {
      console.log(err)
      return false
    }

    try {
      await this.download(
        'https://www.symantec.com/content/en/us/enterprise/verisign/roots/VeriSign-Class%203-Public-Primary-Certification-Authority-G5.pem',
        path.resolve(configSavePath, rootCertRelativePath)
      )
    } catch (err) {
      console.log('Download AWS root certificate failed.')
      console.log(err)
      return false
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
      console.log(err)
      return false
    }
    return true
  }

  download(url, dest) {
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
