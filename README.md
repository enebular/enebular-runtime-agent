# enebular-agent - Mbed Cloud Connector

*Read this in other languages: [English](README.md), [日本語](README.ja.md)*

This application is an Pelion Device Management client that is used together with the main enebular-agent application to support communication with enebular via Pelion Device Management.

It implements a "connector service" for the main enebular-agent by connecting to Pelion Device Management and passing on data received through Pelion Device Management resource updates to the enebular-agent via a Unix socket.

This project currently utilizes the build system from the [mbed-cloud-client-example](https://github.com/ARMmbed/mbed-cloud-client-example) project as-is.

## Developer and Factory Modes

As with the mbed-cloud-client-example project, by default the project is set up to use developer credentials to connect to Pelion Device Management. If you want to run it with factory created credentials, disable developer mode before building the app by changing the `MBED_CONF_APP_DEVELOPER_MODE` definition in the `define.txt` file to `0`, as shown below.

```
add_definitions(-DMBED_CONF_APP_DEVELOPER_MODE=0)
```

## Building

As this is an Mbed project, the following instructions assume a general knowledge of how Mbed projects are constructed and built.

The steps to prepare this project for building are as follows.

1. Install the [Mbed CLI tool](https://github.com/ARMmbed/mbed-cli#installing-mbed-cli).

2. Get a copy of the project by cloning it with the `git clone` command or by using the `mbed import` command.

3. Move into the project directory (make it your current directory).

4. If you retrieved the project by cloning it with git, you'll need to then use the Mbed CLI tool to add in the referenced libraries with the `mbed deploy` command.

If you're using developer mode, set your Pelion Device Management developer connection credentials by doing the following.

1. Log into the [Pelion Device Management portal](https://portal.mbedcloud.com/login)

2. Go to "Device identity > Certificates"

3. Select "Actions > Create a developer certificate"

4. Download the "Developer C file" which will be named `mbed_cloud_dev_credentials.c`

5. Copy that file to the project directory.

The project is now ready to be built. This can be done with the following command.

```
python pal-platform/pal-platform.py fullbuild --target x86_x64_NativeLinux_mbedtls --toolchain GCC --external ./../define.txt --name enebular-agent-mbed-cloud-connector.elf
```

For more information on build options, see the following Pelion Device Management documents.

- [Connect a Linux device](https://cloud.mbed.com/docs/current/connecting/linux-on-pc.html)
- [pal-platform utility](https://cloud.mbed.com/docs/current/porting/using-the-pal-platform-utility.html)

Once built, you should end up with an executable binary called `enebular-agent-mbed-cloud-connector.elf` under the `out/Debug` and `out/Release` directories.

## Running

As this application communicates with the main enebular-agent, that application must be started first. More specifically, you must run the 'local' port [1] of the enebular-agent. For information on how to configure and run enebular-agent, refer to its project readme.

[1]: Here a 'port' refers to the individual enebular-agent editions created to allow it to work with external services such as AWS IoT and Pelion Device Management.

Once the the main enebular-agent application is running you can run the `enebular-agent-mbed-cloud-connector.elf` executable. Once it has connected to Pelion Device Management, it is available for use as an agent with enebular.

By default it will not output any log messages to the console, but this can be enabled by specifying the `-c` option. For information on all supported options, specify the `-h` option as shown below.

```
./out/Release/enebular-agent-mbed-cloud-connector.elf -h
```
