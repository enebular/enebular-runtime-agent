/* @flow */
import IoT from 'aws-sdk/clients/iot'
import IAM from 'aws-sdk/clients/iam'
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

  async _attachPolicy(iam: IAM, roleName: string, policyName: string) {
    let policy
    try {
      const ret = await iam
        .listPolicies({
          PathPrefix: '/enebular/'
        })
        .promise()
      const policies = ret.Policies.filter((item) => {
        return item.PolicyName === policyName
      })
      if (policies.length > 0) {
        policy = policies[0]
      }
    } catch (err) {
      throw new Error('Failed to list policies, reason:\n' + err.message)
    }

    if (!policy) {
      try {
        const ret = await iam
          .createPolicy({
            PolicyName: policyName,
            Path: '/enebular/',
            PolicyDocument: fs.readFileSync(`./${policyName}.json`, 'utf8')
          })
          .promise()
        policy = ret.Policy
      } catch (err) {
        throw new Error('Failed to create policy, reason:\n' + err.message)
      }
    }

    try {
      await iam
        .attachRolePolicy({
          PolicyArn: policy.Arn,
          RoleName: roleName,
        })
        .promise()
    } catch (err) {
      throw new Error('Failed to attach policy to role, reason:\n' + err.message)
    }
  }

  async _ensureRoleCreated() {
    const iam = new IAM();
    const roleName = 'enebular_aws_iot_role'
    let roleArn
    try {
      const ret = await iam.getRole({ RoleName: roleName }).promise()
      roleArn = ret.Role.Arn
    } catch (err) {
      if (err.statusCode !== 404) {
        throw new Error('Failed to get role, reason:\n' + err.message)
      }
      console.log(
        `Unable to find ${roleName}, creating...`
      )
      try {
        const ret = await iam
          .createRole({
            RoleName: roleName,
            Path: "/service-role/",
            AssumeRolePolicyDocument: fs.readFileSync(`./${roleName}_trust_relationship_policy.json`, 'utf8')
          })
          .promise()
        roleArn = ret.Role.Arn
      } catch (err) {
        throw new Error('Failed to create role, reason:\n' + err.message)
      }
    }

    let ret
    try {
      ret = await iam.listAttachedRolePolicies({ RoleName: roleName }).promise()
    } catch (err) {
      throw new Error('Failed to listAttachedRolePolicies, reason:\n' + err.message)
    }

    const policyNamesArray = ['enebular_aws_iot_shadow_update']
    const allPromise = policyNamesArray.map(async(name) => {
      const policies = ret.AttachedPolicies.filter((item) => {
        return item.PolicyName === name
      })
      if (policies.length < 1) {
        console.log(
          `${name} policy is not attached to ${roleName}, attaching...`
        )
        return this._attachPolicy(iam, roleName, name)
      }
    })
    await Promise.all(allPromise)
    return roleArn
  }

  async createThing(configSavePath: ?string, thingName: ?string) {
    if (!thingName) {
      throw new Error('thingName is required.')
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
      throw new Error(
        'Get AWS IoT unique endpoint failed. Please check your aws iot configuration.'
      )
    }

    let keysAndCert
    try {
      keysAndCert = await iot
        .createKeysAndCertificate({ setAsActive: true })
        .promise()
    } catch (err) {
      throw new Error('Create key pairs and certificate failed.')
    }

    const policyName = 'enebular_policy'


    try {
      await iot.getPolicy({ policyName: policyName }).promise()
    } catch (err) {
      console.log(
        'Failed to find enebular_policy, creating enebular_policy...'
      )
      try {
        await iot
          .createPolicy({
            policyName: policyName,
            policyDocument: fs.readFileSync(`./${policyName}.json`, 'utf8')
          })
          .promise()
      } catch (err) {
        throw new Error('Failed to create policy.')
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
      throw new Error('Attach policy to certificate failed.')
    }

    try {
      await iot.createThing({ thingName: thingName }).promise()
    } catch (err) {
      throw new Error('Create thing failed.')
    }

    try {
      await iot
        .attachThingPrincipal({
          thingName: thingName,
          principal: keysAndCert.certificateArn
        })
        .promise()
    } catch (err) {
      throw new Error('Attach thing to certificate failed.')
    }

    const roleArn = await this._ensureRoleCreated()
    const enebularShadowUpdateRuleName = "enebular_shadow_update"
    try {
      await iot.getTopicRule({
        ruleName: enebularShadowUpdateRuleName
      })
      .promise()
    } catch (err) {
      if (err.statusCode !== 401) {
        console.log(err)
        throw new Error('Failed to get rule, reason:\n' + err.message)
      }
      try {
        await iot
          .createTopicRule({
            ruleName: enebularShadowUpdateRuleName,
            topicRulePayload: {
              actions: [
                {
                  republish: {
                    roleArn: roleArn,
                    topic: '$$aws/things/${topic(3)}/shadow/update'
                  }
                }
              ],
              sql: "SELECT * FROM 'enebular/things/+/shadow/update'",
            }
          })
          .promise()
      } catch (err) {
        throw new Error('Failed to createTopicRule, reason:\n' + err.message)
      }
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
        'https://www.symantec.com/content/en/us/enterprise/verisign/roots/VeriSign-Class%203-Public-Primary-Certification-Authority-G5.pem',
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
