
# enebular agent

*Read this in other languages: [English](README.md), [日本語](README.ja.md)*

enebular-agent is Node.js based IoT agent software for Linux devices. enebular-agent works together with enebular to allow Node-RED flows to be deployed to and executed on the IoT device, and for the status of the IoT device to be reported back to enebular.

enebular-agent has the following key functionality.

- IoT device (agent) registration and authentication.
- Management of a Node-RED instance, and deployment and execution of flows sent from enebular to that.
- Status and log reporting to enebular.

enebular communicates with enebular-agent via a third-party IoT platform connection. The supported IoT platform connection types are as follows.

 - AWS IoT

## Structure

enebular-agent is implemented as a collection of Node.js modules. The agent's core runtime functionality is implemented as the `enebular-runtime-agent` module (under the `agent` directory). On top of this, there is a module for each of the supported IoT platform connection types (under the `ports` directory). Each of the ports includes the enebular-runtime-agent core module as a dependency.

Node-RED is also installed as a Node.js module.

## Configuration

The enebular-runtime-agent core supports a number of configuration options that are available no matter what IoT platform port is used. This includes the following.

- Logging level
- Logging to console on/off
- enebular log cache size and location etc
- Node-RED instance location (path) and run command

The enebular-runtime-agent core's configuration options are set by the port when it is instantiated. See each port for details on how the configuration is set.

## Usage

To run enebular-agent you need to install the required Node.js modules (with npm etc) and correctly configure the required IoT platform connection details. The required modules and connection configuration differs for each IoT platform.

Please see the readme files of each port for details on how to set up and run the enebular-agent.

- [AWS IoT](ports/awsiot/README.md)
