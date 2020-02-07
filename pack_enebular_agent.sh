#!/bin/bash
set -e

(cd node-red && npm i --production)
(cd agent && npm i --production)
(cd ports/awsiot && npm i --production)
(cd ports/pelion && npm i --production)

(cd tools/mbed-cloud-connector-fcc && mbed config root . && mbed deploy -v \
&& python pal-platform/pal-platform.py -v deploy --target=x86_x64_NativeLinux_mbedtls generate \
&& ./build-linux-release.sh \
&& cp __x86_x64_NativeLinux_mbedtls/Release/factory-configurator-client-enebular.elf ./factory-configurator-client-enebular.elf \
&& rm -r __x86_x64_NativeLinux_mbedtls && rm -rf mbed-cloud-client && rm -rf mbed-os && rm -rf storage-selector \
&& python pal-platform/pal-platform.py clean --target x86_x64_NativeLinux_mbedtls \
&& mkdir -p __x86_x64_NativeLinux_mbedtls/Release && mv *.elf __x86_x64_NativeLinux_mbedtls/Release/)

(cd tools/mbed-cloud-connector && mbed config root . && mbed deploy \
&& python pal-platform/pal-platform.py fullbuild --target x86_x64_NativeLinux_mbedtls --toolchain GCC --external ./../define_factory.txt --name enebular-agent-mbed-cloud-connector.elf -j$(nproc) \
&& cp out/Release/enebular-agent-mbed-cloud-connector.elf ./enebular-agent-mbed-cloud-connector-factory.elf \
&& python pal-platform/pal-platform.py fullbuild --target x86_x64_NativeLinux_mbedtls --toolchain GCC --external ./../define.txt --name enebular-agent-mbed-cloud-connector.elf -j$(nproc) \
&& cp out/Release/enebular-agent-mbed-cloud-connector.elf ./enebular-agent-mbed-cloud-connector-developer.elf \
&& rm -r out && rm -rf ./mbed-cloud-client \
&& python pal-platform/pal-platform.py clean --target x86_x64_NativeLinux_mbedtls \
&& mkdir -p out/Release && mv *.elf out/Release/)
