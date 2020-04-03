
# enebular-agent - AWS IoT Port

*Read this in other languages: [English](README.md), [日本語](README.ja.md)*

The AWS IoT port allows enebular-agent to be used with an AWS IoT connection.

The following describes an example of setting up and running the AWS IoT port. All directories in the example are written with an assumed base of the enebular-agent project directory. It is also assumed you have Node.js (9.2.1) and npm (5.5.1) installed already.

## Setup

Please read [enebular-docs](https://docs.enebular.com/) for more info.

1 . Install the modules of the enebular-agent core.

```
cd agent
npm ci && npm run build
```

2 . Install the Node-RED instance.

```
cd node-red
npm ci
```

3 . Install the AWS IoT port's modules.

```
cd ports/awsiot
npm ci && npm run build
```

4 . Obtain the AWS IoT thing cert files to be used with this device (from the AWS console etc) and copy them to the AWS IoT port's directory.

5 . Obtain the AWS IoT thing connection details for the device (from the AWS console etc) and create the AWS IoT port's `config.json` file with those details (including the correct paths of the cert files).
    The format of `config.json` is as follows.

```
{
  "host": "<THING SHADOW REST API ENDPOINT>",
  "port": 8883,
  "clientId": "<THING NAME>",
  "thingName": "<THING NAME>",
  "caCert": "./certs/<ROOT CERTIFICATE>",
  "clientCert": "./certs/<THING CERT>",
  "privateKey": "./certs/<THING PRIVATE KEY>",
  "topic": "aws/things/<THING NAME>/shadow/update"
}
```

## Running

Once the above setup has been completed, enebular-agent can be started from the AWS IoT port's directory with the `npm run start` command. By default enebular-agent will not log to the console, however this can be enabled by setting the `DEBUG` environment variable to either `info` or `debug`.

```
DEBUG=info npm run start
```

If enebular-agent successfully starts and connects to AWS IoT, it will display the following log message.

```
internal: aws-iot: Connected to AWS IoT
```

Once that message is displayed, the device can be used with enebular.

## Further Configuration Options

Please see the [main readme](../../README.md) for configuration options common to all enebular-agent ports.
