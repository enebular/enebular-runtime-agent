import S3Store from './src/s3';

const store = new S3Store({
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  s3BucketName: process.env.S3_BUCKET_NAME,
  s3BaseKey: process.env.S3_BASE_KEY,
});

async function main() {
  const url = await store.createPackage({ flows: {}, creds: {}, });
  console.log('download url =>', url);
}

if (require.main === module) {
  main();
}
