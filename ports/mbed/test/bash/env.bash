#!/bin/bash
SRC=$(cd $(dirname "$0"); pwd)
source "${SRC}/include.bash"

AGENT_BIN=`realpath ${SRC}/../../bin/enebular-local-agent`

BIN='DEBUG="debug" NODE_RED_DIR="/node-red-dir-overide" '${AGENT_BIN}''
run "$BIN"
exists "agent takes NODE_RED_DIR env" "node-red-dir-overide"

BIN='DEBUG="debug" NODE_RED_DATA_DIR="/node-red-data-dir-overide" '${AGENT_BIN}''
run "$BIN"
exists "agent takes NODE_RED_DATA_DIR env" "node-red-data-dir-overide"

BIN='DEBUG="debug" NODE_RED_COMMAND="/node-red-command-overide" '${AGENT_BIN}''
run "$BIN"
exists "agent takes NODE_RED_COMMAND env" "node-red-command-overide"

BIN='DEBUG="debug" ENEBULAR_CONFIG_PATH="/enebular-config-file-overide" '${AGENT_BIN}''
run "$BIN"
exists "agent takes ENEBULAR_CONFIG_PATH env" "enebular-config-file-overide"

BIN='DEBUG="debug" ENEBULAR_MBED_CLOUD_CONNECTOR_EXECUTABLE_FILE="enebular-mbed-cloud-connector-executable-file-overide" '${AGENT_BIN}''
run "$BIN" 5
exists "agent takes ENEBULAR_MBED_CLOUD_CONNECTOR_EXECUTABLE_FILE env" "enebular-mbed-cloud-connector-executable-file-overide"

BIN='DEBUG="debug" ENEBULAR_LOCAL_PORT_SOCKET_PATH="enebular-local-port-socket-path-overide" '${AGENT_BIN}''
run "$BIN" 5
exists "agent takes ENEBULAR_LOCAL_PORT_SOCKET_PATH env" "enebular-local-port-socket-path-overide"
