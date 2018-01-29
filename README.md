
# Enebular Runtime Agent

*Read this in other languages: [English](README.md), [日本語](README.ja.md)*

The Enebular runtime agent is a Node.js based system application for Linux devices. The agent works together with Enebular to allow Node-RED flows to be deployed to the device and for the device to report information back to Enebular.

The agent has the following key functionality.

- Device (agent) registration and authentication.
- Management of a Node-RED instance and deploying flows sent from enebular to that.
- Status and log reporting to Enebular.

Enebular communicates with the agent via a third-party IoT platform connection. The supported IoT Platform connection types are as follows.

 - AWS IoT

## Structure

The agent is implemented as a collection of Node.js modules. The agent's core runtime functionality is implemented as the `enebular-runtime-agent` module (under the `agent` directory). On top of this, there is a module for each of the supported IoT platform connection types (under the `ports` directory). Each of the ports includes the agent core module as a dependency.

Node-RED is also installed as a Node.js module.

## Configuration

The agent core supports a number of configuration options that are available no matter what IoT platform port is used. This includes the following.

- Logging level
- Logging to console on/off
- Enebular log cache size and location etc
- Node-RED instance location and run command

The agent core's configuration options are set by the port when it is instantiated. See each port for details on how the configuration is set.

## Usage

To run the agent you need to install the required Node.js modules (with npm etc) and correctly configure the required IoT platform connection details. The required modules and connection configuration differs for each IoT platform.

Please see the readme files of each port for details on how to set up and run the agent.

- [AWS IoT](ports/awsiot/README.md)
