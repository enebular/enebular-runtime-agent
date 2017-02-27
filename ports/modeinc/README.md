## MODEinc enebular agent demo

1. Setup env vars for agent of MODEinc
```
cd agent
vi .env

DEVICE_ID=<device id in modeinc>
DEVICE_API_KEY=<device api key in modeinc>
```

2. Start agent

```
nf run npm start
```

3. Setup env vars for commander of MODEinc

```
cd command
vi .env

PROJECT_ID=<your modeinc project id>
PROJECT_API_KEY=<your modeinc project api key>
HOME_ID=<your modeinc home id>
AWS_ACCESS_KEY_ID=<your aws access key id>
AWS_SECRET_ACCESS_KEY=<your aws secret access key id>
S3_BUCKET_NAME=<s3 bucket name to upload flow package>
S3_BASE_KEY=<s3 prefix key (=folder path) of flow package file object>
````

4. Send update-flow message from commander

```
nf run npm start notify {DEVICE_ID} update-flow {path-to-flow-file} {path-to-cred-file} {path-to-deps-file}
```

e.g.
```
nf run npm start notify 1316 update-flow ./data/01/flows.json ./data/01/flows_cred.json ./data/01/packages.json
```
