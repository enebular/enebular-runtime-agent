
# enebular-agent - Pelion Port

*Read this in other languages: [English](README.md), [日本語](README.ja.md)*

The 'pelion' port allows enebular-agent to be used with an Arm Pelion connection.

The following describes an example of setting up and running the Pelion port. All directories in the example are written with an assumed base of the enebular-agent project directory. It is also assumed you have Node.js (9.2.1) and npm (5.5.1) installed already.

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

3 . Install the Pelion port's modules.

```
cd ports/pelion
npm ci && npm run build
```

4 . Setup the mbed-cloud-connector in the tools directory by following its [readme file](../../tools/mbed-cloud-connector/README.md).

## Running

Once the above setup has been completed, enebular-agent can be started from the pelion port directory with the `npm run start` command. By default enebular-agent will not log to the console, however this can be enabled by setting the `DEBUG` environment variable to either `info` or `debug`.

```
DEBUG=info npm run start
```

If enebular-agent successfully starts and connects to Pelion, it will display the following log message.

```
internal: pelion: conntector: Mbed Cloud: Client: connected
```

## Further Configuration Options

Please see the [main readme](../../README.md) for configuration options common to all enebular-agent ports.
