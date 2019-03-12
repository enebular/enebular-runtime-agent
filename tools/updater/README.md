
# enebular-agent Updater

*Read this in other languages: [English](README.md), [日本語](README.ja.md)*

This utility can be used to easily update a version of eneblar-agent previously installed on Debian based systems with enebular-agent's install script to the lastest version available.

The updater itself is a Node.js application, but a bash script is also provided which allows updates to be run quickly with just one step.

## Simple Updates using the Bash Script

To use the updater script directly on a target device, you can download it with wget and then run it as shown below.

```sh
wget -qO- https://enebular.com/agent-update | sudo -E bash -s
```

The updater script can also be run on a remote target device via SSH with the following command pattern.

```sh
ssh -t <user>@<device-ip-address> "wget -qO- https://enebular.com/agent-update | sudo -E bash -s"
```

For example, to run the script on a remote Raspberry Pi with the default `pi` user and an IP address of `192.168.1.125,` the command would be as follows.

```sh
ssh -t pi@192.168.1.125 "wget -qO- https://enebular.com/agent-update | sudo -E bash -s"
```

## Manual Updates using the Updater App Directly

Using the updater script is reccomended as it makes the update a quick one-step process, however the updater app can also be set up manually and run directly on a target device as described below.

Go to the updater directory in the enebular-agent project.

```sh
cd tools/updater
```

Install updater's npm packages.

```sh
npm install
```

Run the updater.

```sh
sudo ./bin/enebular-agent-update
```

## Confirmation

Once the updater has completed successfully, it will display a message similar to the following.

```sh
==== Starting enebular-agent <version> ====
OK
==== Verifying enebular-agent <version> ====
OK
Update succeeded ✔

```

## Options

TODO

```sh
OPTION                       DESCRIPTION	
--user <user>                User under which enebular-agent has been installed
--pelion-mode <mode>         Pelion mode (developer or factory) selected when enebular-agent was installed
```

## Update Process

TODO

### Bash Script

TODO

### Updater App

TODO
