
# enebular-agent Updater

*Read this in other languages: [English](README.md), [日本語](README.ja.md)*

This utility can be used to easily update a version of eneblar-agent previously installed on Debian based systems with enebular-agent's install script to the latest version available.

The updater itself is a Node.js application, but a bash script is also provided which allows updates to be run quickly with just one step.

## Update Options

The following options can be specified when updating.

### User

If enebular-agent was installed under a non-default user, then that user must be specified with the `--user` option when updating too.

### Pelion Port Mode

When updating the Pelion port of enebular-agent, the Pelion mode used must be specified with the `--pelion-mode` option (either `developer` or `factory`).

## Simple Updates Using Bash Script

To use the updater script directly on a target device, you can download it with wget and then run it as shown below.

```sh
wget -qO- https://enebular.com/agent-update | sudo -E bash -s
```

Update options can be added by first appending `--` at the end of the command, as in the command pattern below.

```sh
wget -qO- https://enebular.com/agent-update | sudo -E bash -s -- <option>
```

The updater script can also be run on a remote target device via SSH with the following command pattern.

```sh
ssh -t <user>@<device-ip-address> "wget -qO- https://enebular.com/agent-update | sudo -E bash -s"
```

For example, to run the script on a remote Raspberry Pi with the default `pi` user, an IP address of `192.168.1.125,` and specifying `factory` for the Pelion port mode, the command would be as follows.

```sh
ssh -t pi@192.168.1.125 "wget -qO- https://enebular.com/agent-update | sudo -E bash -s -- --pelion-mode=factory"
```

## Manual Updates Using Updater App Directly

Using the updater script is recommended as it makes the update a quick one-step process, however the updater app can also be set up manually from source and run directly on a target device as described below.

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

The most commonly used options are shown below. These options can be used both with the bash script and directly with the updater app itself.

```sh
OPTION                       DESCRIPTION	
--user                       User under which enebular-agent has been installed
--pelion-mode                Pelion mode (developer or factory) selected when enebular-agent was installed
-h, --help                   Output usage information
```

To show a full list of the supported options, specify the `-h` option when running the bash script or updater app directly.

## Update Process

The following describes the update process followed by the bash script and updater app.

### Bash Script

TODO

### Updater App

TODO
