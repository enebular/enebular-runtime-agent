#!/bin/bash
set -e

(cd node-red && npm ci --production)
(cd agent && npm ci --production)
(cd ports/awsiot && npm ci --production)
(cd ports/pelion && npm ci --production)

(cd tools/mbed-cloud-connector && mbed config root . && mbed deploy \
&& python pal-platform/pal-platform.py fullbuild --target x86_x64_NativeLinux_mbedtls --toolchain GCC --external ./../define_factory.txt --name enebular-agent-mbed-cloud-connector.elf -j$(nproc) \
&& cp out/Release/enebular-agent-mbed-cloud-connector.elf ./enebular-agent-mbed-cloud-connector-factory.elf \
&& python pal-platform/pal-platform.py fullbuild --target x86_x64_NativeLinux_mbedtls --toolchain GCC --external ./../define.txt --name enebular-agent-mbed-cloud-connector.elf -j$(nproc) \
&& cp out/Release/enebular-agent-mbed-cloud-connector.elf ./enebular-agent-mbed-cloud-connector-developer.elf \
&& rm -r out && rm -rf ./mbed-cloud-client \
&& python pal-platform/pal-platform.py clean --target x86_x64_NativeLinux_mbedtls \
&& mkdir -p out/Release && mv *.elf out/Release/)
