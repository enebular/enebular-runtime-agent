
# enebular-agent Updater

*Read this in other languages: [English](README.md), [日本語](README.ja.md)*

This utility can be used to easily update a version of eneblar-agent previously installed on Debian based systems with enebular-agent's install script to the latest version available.

The updater itself is a Node.js application, but a bash script is also provided which allows updates to be run quickly in just one step.

## Update Options

The following options can be specified when updating.

### User

If enebular-agent was installed under a non-default user, then that user must be specified with the `--user` option when updating too.

### Pelion Port Mode

When updating the Pelion port of enebular-agent, the Pelion mode in use must be specified with the `--pelion-mode` option (either `developer` or `factory`).

## Simple Updates Using Bash Script

To run the updater script on a target device, you can download it with wget and then run it as shown below.

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

To show a full list of the supported options, specify the `-h` option when running the bash script or updater app.

## Update Process

The following describes the update process followed by the bash script and updater app.

### Bash Script

1. The latest version of the updater app is downloaded and extracted to a temporary location.
1. The version of Node.js required by the updater app is read from its package definition file.
1. If the required version isn't available already, it is downloaded and installed under the enebular-agent user's home directory.
1. The updater app is run.
1. Once the updater app finishes it is deleted from its temporary location.

### Updater App

1. The existing install of enebular-agent is found and interrogated
1. Details of the existing enebular-agent are logged
1. The new version of enebular-agent is downloaded and extracted to a temporary location.
1. The new version if enebular-agent is set up. This includes installing any system package dependencies and installing a new version of Node.js if required.
1. The existing enebular-agent is halted.
1. All existing enebular-agent configuration and data files are migrated to the new version.
1. The existing enebular-agent and new enebular-agent are swapped.
1. The new enebular-agent is started.

