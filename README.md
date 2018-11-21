# enebular-agent

_Read this in other languages: [English](README.md), [日本語](README.ja.md)_

enebular-agent is Node.js based enebular IoT agent software for Linux gateways. enebular-agent works together with enebular to allow Node-RED flows to be deployed to and executed on the IoT device, and for the status of the IoT device to be reported back to enebular.

enebular-agent has the following key functionality.

- IoT device (agent) activation, registration and authentication.
- Management of a Node-RED instance, and deployment and execution of flows sent from enebular to that.
- Deployment and execution of files sent from enebular.
- Status and log reporting to enebular.
- Support for the enebular editor.

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

### File Deploys

enebular-agent installs files deployed from enebular. It supports the execution of those files and also running any command hooks that have been configured.

### Logging

enebular-agent will periodically send logged messages to enebular. It can also log to its own standard output streams (command-line console), but this is not enabled by default. To have it also log to the console, set the `DEBUG` environment variable. enebular-agent can also optionally log to syslog. See ’Configuration’ below for more information on configuration options.

enebular-agent captures and re-logs any messages that Node-RED logs to its standard output streams (stdout and stderr). This includes any messages from nodes in the flow being run which log to the console, like when the debug node is configured to log to the "debug tab and console". All messages captured from Node-RED are currently re-logged at the 'info' log level.

To view the logs on enebular, the device must be a 'paid' device.

### Status Reporting

enebular-agent provides simple reporting on its status to enebular (when it has been made a 'paid' device).

### enebular editor Support

enebular-agent supports being used together with the enebular enebular editor. This allows you to deploy flows from the enebular editor directly to the enebular-agent device via the local network.

## Structure

enebular-agent is implemented as a collection of Node.js modules. Its core runtime functionality is implemented as the `enebular-runtime-agent` module (under the `agent` directory). On top of this, there is a module for each of the supported IoT platform connection types (under the `ports` directory). Each of the ports includes the enebular-runtime-agent core module as a dependency. See below for more information on the ports.

Node-RED is also installed as a Node.js module.

## Ports

A 'port' refers to the individual enebular-agent editions created to allow it to work with external connection services such as AWS IoT and Pelion Device Management.

To use enebular-agent you select the appropriate port for the IoT platform connection type you want to use, install and configure the port, and then run it using the executable under its `bin` directory.

The current ports are:

- **AWS IoT** - For use with AWS IoT
- **Local** - For use together other local programs
  - This is used together with the [enebular-agent Mbed Cloud Connector](https://github.com/enebular/enebular-runtime-agent-mbed-cloud-connector) when using enebular-agent with Pelion Device Management

## Using enebular editor Mode

To use enebular-agent with the enebular editor, you will first need to install enebular-agent manually. For instructions on installing it manually, see the _Manual Setup_ section further below.

```sh
cd ports/awsiot
./bin/enebular-awsiot-agent --dev-mode
```

## Quick Setup

You can quickly set up enebular-agent on a Debian based device (like a Raspberry Pi) by using the install script. The best way to use the script is by running it as a command with an ssh client on your development PC. To use the script you'll need to have the following.

- An ssh client command installed on your development PC
- The `sudo` command installed on your target device

You'll also need the following information about the target device.

- User login details (username and password)
- Current IP address

If you are using enebular-agent with AWS IoT and you'd like to automatically add a new _thing_ to use, you'll also need to know the following.

- Your AWS account access key ID
- Your AWS account secret access key
- Your AWS IoT region
- A name for the new _thing_

### Basic Usage

The install script can be run on a remote device by using SSH on your development PC with the following command pattern.

```sh
ssh -t <user>@<device-ip-address> "wget -qO- https://enebular.com/agent-install | sudo -E bash -s"
```

This installs the AWS IoT enebular-agent port by default.

For example, to run the script on a remote Raspberry Pi with the default `pi` user and an IP address of `192.168.1.125`, the command would be as follows.

```sh
ssh -t pi@192.168.1.125 "wget -qO- https://enebular.com/agent-install | sudo -E bash -s"
```

This will install the AWS IoT enebular-agent port, but as it will be missing the required connection info it will not actually run. If you'd like to automatically add a new AWS IoT _thing_ to use, then follow the instructions in the "Automatic AWS IoT Thing Creation and Setup" section below instead.

If you'd like to set up the connection info manually, you'll need to add the required files for the port (in the correct location and with the correct user permissions) as specified in the port's readme file and then restart enebular-agent. See the "Manual Setup" section further below for more details on this.

### Automatic AWS IoT Thing Creation and Setup

To install the AWS IoT enebular-agent port and also add a new AWS IoT _thing_ to use, the following four options must also be specified.

```
--aws-access-key-id=<Your AWS account access key ID>
--aws-secret-access-key=<Your AWS account secret access key>
--aws-iot-region=<Your AWS IoT region>
--aws-iot-thing-name=<A name for the new thing>
```

For example, to install the AWS IoT port and create an AWS IoT thing named `raspberry-pi` on a Raspberry Pi device (with the `pi` user and IP address of `192.168.1.125`), the command would be similar to the following.

```sh
ssh -t pi@192.168.1.125 "wget -qO- https://enebular.com/agent-install | sudo -E bash -s -- --aws-iot-thing-name=raspberry-pi --aws-access-key-id=<my-key-id> --aws-secret-access-key=<my-access-key> --aws-iot-region=<my-region>"
```

### Confirmation

Once the script has completed successfully, it will display a report similar to the following.

```
 enebular-agent has been successfully installed ✔
 Version: <version>
 Location: <directory>
 User: enebular
 AWS IoT Thing <thing-name> has been created.
 enebular-agent is running as a system service.
 To check the status of agent, run the following command on the target device:
   sudo journalctl -ex -u enebular-agent-<user>.service
```

### More Details

For more information about other options the install script has, please refer to its readme file.

- [Install script README](tools/install/README.md)

## Manual Setup

The following describes how to set up enebular-agent manually (without using the install script).

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

```sh
cd ports/<port>
./bin/enebular-<port>-agent list-config-items
```

For example, if using AWS IoT, then the command is as follows.

```sh
cd ports/awsiot
./bin/enebular-awsiot-agent list-config-items
```

### Startup Registration

enebular-agent has the ability to generate and register the configuration needed for it to be started up automatically at boot-time on Debian (systemd) based devices. This is done by running the port's executable with the `startup-register` subcommand and specifying an appropriate user (for enebular-agent to run as).

An example of using the `startup-register` subcommand and specifying `enebular` for the user when using the AWS IoT port is shown below.

```sh
cd ports/awsiot
./bin/enebular-awsiot-agent startup-register -u enebular
```

As with the `ENEBULAR_LOG_LEVEL` option in the following example, any extra configuration options that are specified will be captured and included in the startup configuration.

```sh
ENEBULAR_LOG_LEVEL=debug ./bin/enebular-awsiot-agent startup-register -u enebular
```

As registering the startup configuration requires root permissions, when the `startup-register` subcommand is run without root permissions it will not attempt the registration but instead display the correct full `sudo` command that should actually be run. Follow the instructions and run the full `sudo` command that is displayed.

### Confirmation

Once it's registered to start up automatically, you should be able to check the status of the enebular-agent with the systemd journal using the following command pattern.

```sh
sudo journalctl -ex -u enebular-agent-<user>.service
```

If the user was set to `enebular`, the command to use will be:

```sh
sudo journalctl -ex -u enebular-agent-enebular.service
```

To restart enebular-agent, use the following command.

```sh
sudo systemctl restart enebular-agent-enebular.service
```
