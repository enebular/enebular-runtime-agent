
# enebular-agent - Local Port

*Read this in other languages: [English](README.md), [日本語](README.ja.md)*

The 'local' port allows enebular-agent to be used in conjunction with another local process via a Unix socket. This other process acts as a proxy to an IoT platform connection, delivering commands to the agent.

The following describes an example of setting up and running the local port. All directories in the example are written with an assumed base of the enebular-agent project directory. It is also assumed you have Node.js and npm installed already.

## Setup

1. Install the modules of the enebular-agent core.

```
cd agent
npm install
```

2. Install the Node-RED instance.

```
cd node-red
npm install
```

3. Install the local port's modules.

```
cd ports/local
npm install
```

## Running

Once the above setup has been completed, enebular-agent can be started from the local port directory with the `npm run start` command. With this command, it is necessary to also set the `NODE_RED_DIR` environment variable to point to the directory Node-RED is installed in. Also, by default enebular-agent will not log to the console, however this can be enabled by setting the `DEBUG` environment variable to either `info` or `debug`.

```
NODE_RED_DIR=../../node-red DEBUG=info npm run start
```

If enebular-agent starts successfully, it will display the following log message.

```
internal: local: server listening on: "/tmp/enebular-local-agent.socket"
```

Once that is displayed, enebular-agent is ready to be used with the local proxy application.

## Further Configuration Options

Please see the [main readme](../../README.md) for configuration options common to all enebular-agent ports.
