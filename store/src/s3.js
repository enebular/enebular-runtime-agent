import AWS from 'aws-sdk';
import uuid from 'uuid';
import PackageStore from '.';

/**
 *
 */
export default class S3Store extends PackageStore {
  constructor({ awsAccessKeyId, awsSecretAccessKey, s3BucketName, s3BaseKey, s3ExpirySec }) {
    super();
    this._awsAccessKeyId = awsAccessKeyId;
    this._awsSecretAccessKey = awsSecretAccessKey;
    this._s3BucketName = s3BucketName;
    this._s3BaseKey = s3BaseKey;
    this._s3ExpirySec = s3ExpirySec || 60;
  }

  async savePackage(data) {
    const s3 = new AWS.S3({
      accessKeyId: this._awsAccessKeyId,
      secretAccessKey: this._awsSecretAccessKey,
    });
    const ret = await this.uploadToS3(s3, data);
    return this.getSignedDownloadUrl(s3, ret.Key, { Expires: this._s3ExpirySec });
  }

  async uploadToS3(s3, data) {
    return new Promise((resolve, reject) => {
      const Key = `${this._s3BaseKey}/${uuid()}.json`;
      s3.putObject({
        Bucket: this._s3BucketName,
        ACL: 'private',
        Key,
        Body: data,
      }, (err, ret) => {
        if (err) { return reject(err); }
        return resolve({ Key });
      });
    });
  }

  async getSignedDownloadUrl(s3, key, options) {
    return new Promise((resolve, reject) => {
      s3.getSignedUrl('getObject',
        Object.assign({
          Bucket: this._s3BucketName,
          Key: key,
        }, options),
        (err, url) => {
          if (err) { return reject(err); }
          return resolve(url);
        }
      );
    });
  }
}
