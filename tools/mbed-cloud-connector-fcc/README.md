
# enebular-agent - Mbed Cloud Connector FCC

The enebular-agent Mbed Cloud Connector FCC (Factory Configurator Client) application is used to store the device provisioning bundle information on the device. It is just a minor adaption of the [factory-configurator-client-example](https://github.com/ARMmbed/factory-configurator-client-example) to allow it to take a bundle file from the local file system.

## Building

To build this for Linux, run the following build script.

```
./build-linux.sh
```

## Running

In addition to the network receive support of the default factory-configurator-client-example, it's possible to directly specify a bundle file as an option to the command, as shown below.

```
./__x86_x64_NativeLinux_mbedtls/Debug/factory-configurator-client-enebular.elf <bundle>
[...]
Successfully handled file bundle
```

If the command completes successfully, on Linux it will create the `pal` directory based on the bundle content in the current directory.

```
ls pal
BACKUP  firmware  flashSim  WORKING
```

For more information, see the documentation for the factory-configurator-client-example and also Factory Configurator Utility (FCU) tool.
