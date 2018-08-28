
# enebular-agent

*Read this in other languages: [English](README.md), [日本語](README.ja.md)*

enebular-agent is Node.js based enebular IoT agent software for Linux gateways. enebular-agent works together with enebular to allow Node-RED flows to be deployed to and executed on the IoT device, and for the status of the IoT device to be reported back to enebular.

enebular-agent has the following key functionality.

- IoT device (agent) activation, registration and authentication.
- Management of a Node-RED instance, and deployment and execution of flows sent from enebular to that.
- Status and log reporting to enebular.

enebular communicates with enebular-agent via a third-party IoT platform connection.

## Features

### Activation, Registration and Authentication

To communicate with enebular, enebular-agent needs to receive its required device 'registration' information. This can occur in one of two supported ways.

- enebular automatically sends it to enebular-agent via the IoT platform connection
- enebular-agent receives it in response to it directly requesting 'activation' with enebular.

In most cases the first method is used. For more information on using activation, see the [activation readme](README-activation.md).

enebular will also automatically update the enebular-agent's authentication information when required to allow it to use 'paid' device features (i.e logging and status reporting).

### Node-RED Flows

enebular-agent accepts flows deployed from enebular and manages a Node-RED instance to run them. It will also automatically install any published node modules that are depended on by the flow being deployed.

### Logging

enebular-agent will periodically send logged messages to enebular. It can also log to its own standard output streams (command-line console), but this is not enabled by default. To have it also log to the console, set the `DEBUG` environment variable. enebular-agent can also optionally log to syslog. See ’Configuration’ below for more information on configuration options.

enebular-agent captures and re-logs any messages that Node-RED logs to its standard output streams (stdout and stderr). This includes any messages from nodes in the flow being run which log to the console, like when the debug node is configured to log to the "debug tab and console". All messages captured from Node-RED are currently re-logged at the 'info' log level.

To view the logs on enebular, the device must be a 'paid' device.

### Status Reporting

enebular-agent provides simple reporting on its status to enebular (when it has been made a 'paid' device).

## Structure

enebular-agent is implemented as a collection of Node.js modules. Its core runtime functionality is implemented as the `enebular-runtime-agent` module (under the `agent` directory). On top of this, there is a module for each of the supported IoT platform connection types (under the `ports` directory). Each of the ports includes the enebular-runtime-agent core module as a dependency. See below for more information on the ports.

Node-RED is also installed as a Node.js module.

## Ports

A 'port' refers to the individual enebular-agent editions created to allow it to work with external connection services such as AWS IoT and Mbed Cloud.

To use enebular-agent you select the appropriate port for the IoT platform connection type you want to use, install and configure the port, and then run it using the executable under its `bin` directory.

The current ports are:

- **AWS IoT** - For use with AWS IoT
- **Local** - For use together other local programs
    - This is used together with the [enebular-agent Mbed Cloud Connector](https://github.com/enebular/enebular-runtime-agent-mbed-cloud-connector) when using enebular-agent with Mbed Cloud

## Quick Setup

You can quickly set up enebular-agent on a Debian based device by using the install script. The best way to use the script is by running it as a command with an ssh client on your development PC. To use the script you'll need to have the following.

- An ssh client command installed on your development PC
- The `sudo` installed command on your target device

You'll also need the following information about the target device.

- User login details (username and password)
- Current IP address

If you are using enebular-agent with AWS IoT and you'd like to automatically add a new *thing* and use that, you'll also need to know the following.

- Your AWS account access key ID
- Your AWS account secret access key
- Your AWS IoT region
- A name for the new *thing*

### Basic Usage

The install script can be run on a remote device via SSH with the following command pattern.

```
ssh -t <user>@<device-ip-address> "wget -qO- https://raw.githubusercontent.com/enebular/enebular-runtime-agent/master/tools/install/install.sh | sudo -E bash -s"
```

For example, to run the script on a remote Raspberry Pi with the default pi user and an IP address of 192.168.1.125, the command would be as follows.

```
ssh -t pi@192.168.1.125 "wget -qO- https://raw.githubusercontent.com/enebular/enebular-runtime-agent/master/tools/install/install.sh | sudo -E bash -s"
```

This will install enebular-agent, but as it will be missing the connection info needed to connect to a third-party IoT platform it will not actually run. If you're using AWS IoT and you'd like to automatically add a new *thing* to use with that, then see the "Automatic AWS IoT Thing Creation and Setup" section below. Otherwise, see the "More Details" section further below.

### Automatic AWS IoT Thing Creation and Setup

TODO

### Confirmation

TODO

### More Details

TODO

## Manual Setup

### Installation

To run enebular-agent you need to install the Node.js modules required by the IoT platform port you want to use and also correctly configure the IoT platform's connection details.

The required modules and connection configuration differs for each IoT platform port. Please see the readme files of each port for details on how to set up and run the enebular-agent.

- [AWS IoT Port README](ports/awsiot/README.md)
- [Local Port README](ports/local/README.md)

### Configuration

enebular-agent supports a number of configuration options set via environment variables that are available no matter what IoT platform port is used. This includes the following.

- `DEBUG` - Have enebular-agent log to the console at the specified log level (i.e. `debug` or `info` etc). Note that if set to `debug` then debug messages will also be sent to enebular (when enebular-agent is authenticated).

- `NODE_RED_DIR` - The path of the installed Node-RED instance.

- `NODE_RED_DATA_DIR` - The path to use as Node-RED's working data (userDir) directory.

- `NODE_RED_COMMAND` - The command to use to start Node-RED.

- `ENEBULAR_CONFIG_PATH` - The path of the enebular-agent's main configuration file.

Each of the ports have additional configuration options. Please see the readme files of each port for details.

A full list of supported configuration options can be displayed by running the port's executable with the `list-config-items` subcommand, as shown below.

```
cd ports/<port>
./bin/enebular-<port>-agent list-config-items
```

For example, if using AWS IoT, then the command is as follows.

```
cd ports/awsiot
./bin/enebular-awsiot-agent list-config-items
```

### Startup Registration

enebular-agent has the ability to generate and register the configuration needed for it to be started up automatically at boot-time on Debian (systemd) based devices. This is done by running the port's executable with the `startup-register` subcommand and specifying an appropriate user (for enebular-agent to run as).

An example of using the `startup-register` subcommand and specifying `enebular` for the user when using the AWS IoT port is shown below.

```
cd ports/awsiot
./bin/enebular-awsiot-agent startup-register -u enebular
```

As with the `ENEBULAR_LOG_LEVEL` option in the following example, any extra configuration options that are specified will be captured and included in the startup configuration.

```
ENEBULAR_LOG_LEVEL=debug ./bin/enebular-awsiot-agent startup-register -u enebular
```

As registering the startup configuration requires root permissions, when the `startup-register` subcommand is run without root permissions it will not attempt the registration but instead display the correct full `sudo` command that should actually be run. Follow the instructions and run the full `sudo` command that is displayed.
