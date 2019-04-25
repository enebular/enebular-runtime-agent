
# enebular-agent Updater

*Read this in other languages: [English](README.md), [日本語](README.ja.md)*

This utility can be used to easily update a version of eneblar-agent that was previously installed on Debian based systems with enebular-agent's install script to the latest version available.

The updater itself is a Node.js application, but a bash script (update script) is also provided which allows the updater to be run quickly in just one step.

## Supported Versions

The updater can be used to update enebular-agent version 2.4.0 and later.

## Key Update Options

The following options should be specified as required when updating.

### User

If enebular-agent was installed under a non-default user, then that user must be specified with the `--user` option when updating too.

### Pelion Port Mode

When updating the Pelion port of enebular-agent, the Pelion mode in use must be specified with the `--pelion-mode` option (either `developer` or `factory`).

## Simple Updates Using Update Script

To run the update script on a target device, you can download it with wget and then run it as shown below.

```sh
wget -qO- https://enebular.com/agent-update | sudo -E bash -s
```

Update options can be specified by first appending `--` at the end of the command, as in the command pattern below.

```sh
wget -qO- https://enebular.com/agent-update | sudo -E bash -s -- <option>
```

The update script can also be run on a remote target device via SSH with the following command pattern.

```sh
ssh -t <user>@<device-ip-address> "wget -qO- https://enebular.com/agent-update | sudo -E bash -s"
```

For example, to run the script on a remote Raspberry Pi with the default `pi` user, an IP address of `192.168.1.125` and specifying `factory` for the Pelion port mode, the command would be as follows.

```sh
ssh -t pi@192.168.1.125 "wget -qO- https://enebular.com/agent-update | sudo -E bash -s -- --pelion-mode=factory"
```

## Manual Updates Using Updater Directly

Using the update script is recommended as it makes the update a quick one-step process, however the updater can also be set up manually from source and run directly on a target device as described below.

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

## Option Details

The most commonly used options are shown below. These options can be specified both when running the update script and when running with the updater directly.

```sh
OPTION                       DESCRIPTION	
--user                       User under which enebular-agent has been installed
--pelion-mode                Pelion mode (developer or factory) selected when enebular-agent was installed
-h, --help                   Output usage information
```

To show a full list of the supported options, specify the `-h` option when running the update script or the updater.

## Update Process

The following describes the update process followed by the update script and updater itself.

### Update Script

1. The latest version of the updater is downloaded and extracted to a temporary location.
1. The version of Node.js required by the updater is read from its package definition file.
1. If the required Node.js version isn't available already, it is downloaded and installed.
1. The updater is run.
1. Once the updater finishes it is deleted from its temporary location.

### Updater

1. The existing enebular-agent is found and its install details checked.
1. Details of the existing enebular-agent are logged.
1. The new version of enebular-agent is downloaded and extracted to a temporary location.
1. The new enebular-agent is set up. This includes installing any new system package dependencies and installing a new version of Node.js if required.
1. The existing enebular-agent is halted.
1. All existing enebular-agent configuration and data files are migrated to the new version.
1. The existing enebular-agent and new enebular-agent are swapped.
1. The new enebular-agent is started.

Note that even if enebular-agent was already halted at the time of the update, it will still be started at the end of the update process.
