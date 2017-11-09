## enebular agent for Mode, Inc.

1. Setup env vars for agent of MODEinc
```
vi .env

NODE_RED_DIR=<path to node-red directory>
DEVICE_ID=<device id in modeinc>
DEVICE_API_KEY=<device api key in modeinc>
```

2. Start agent

```
nf run npm start
```

Or

```
nf run ./bin/enebular-agent-modeinc
```

3. Setup test

```
vi .env

NODE_RED_DIR=<path to node-red directory>
DEVICE_ID=<device id in modeinc>
DEVICE_API_KEY=<device api key in modeinc>

PROJECT_ID=<your modeinc project id>
PROJECT_API_KEY=<your modeinc project api key>
HOME_ID=<your modeinc home id>
````

4. Execute test

```
nf run npm test
```
