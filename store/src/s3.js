import AWS from 'aws-sdk';
import uuid from 'uuid';
import s3UploadStream from 's3-upload-stream';
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

  async savePackage(pkgStream) {
    const s3 = new AWS.S3({
      accessKeyId: this._awsAccessKeyId,
      secretAccessKey: this._awsSecretAccessKey,
    });
    const ret = await this.uploadToS3(s3, pkgStream);
    return this.getSignedDownloadUrl(s3, ret.Key, { Expires: this._s3ExpirySec });
  }

  async uploadToS3(s3, pkgStream) {
    return new Promise((resolve, reject) => {
      pkgStream.pipe(s3UploadStream(s3).upload({
        Bucket: this._s3BucketName,
        ACL: 'private',
        Key: `${this._s3BaseKey}/${uuid()}.zip`,
      }))
      .on('uploaded', resolve)
      .on('error', reject);
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
