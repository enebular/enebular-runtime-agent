## MODEinc enebular agent demo

1. Setup env vars for agent of MODEinc
```
cd agent
vi .env

DEVICE_ID=XXXX
DEVICE_API_KEY=v1.XXXXXX.....
```

2. Start agent

```
nf run npm start
```

3. Setup env vars for commander of MODEinc

```
cd command
vi .env

PROJECT_ID=YYY
PROJECT_API_KEY=v1.YYYYYYY.....
HOME_ID=ZZZ
FLOW_PACKAGE_URL=https://xxxx/yy/zz.zip
````

4. Send message from commander

```
nf run npm start notify {DEVICE_ID} update-flow
```
