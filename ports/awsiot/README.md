## AWSIoT enebular agent demo

1. Download certs from AWS IoT and copy them to example folder

2. Update `config.json` in example folder to specify correct AWS IoT thing entry for the device.

3. Start agent

```
cd example
npm install
npm start
```

4. Setup env vars for commander of AWS IoT

```
cd command
vi .env

AWS_ACCESS_KEY_ID=<your aws access key id>
AWS_SECRET_ACCESS_KEY=<your aws secret access key id>
S3_BUCKET_NAME=<s3 bucket name to upload flow package>
S3_BASE_KEY=<s3 prefix key (=folder path) of flow package file object>
AWS_IOT_REGION=<AWS Region (e.g. us-east-1)>
AWS_IOT_ENDPOINT=<AWS IoT Endpoint (e.g. A3G80UFBM2R6AS.iot.us-east-1.amazonaws.com)>
````

4. Send update-flow message from commander

```
nf run npm start notify {thing-name} update-flow {path-to-flow-file} {path-to-cred-file} {path-to-deps-file}
```

e.g.
```
nf run npm start notify mything01 update-flow ./data/01/flows.json ./data/01/flows_cred.json ./data/01/packages.json
```
