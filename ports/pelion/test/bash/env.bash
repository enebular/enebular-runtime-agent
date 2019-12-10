#!/bin/bash
SRC=$(cd $(dirname "$0"); pwd)
source "${SRC}/include.bash"

AGENT_BIN=`realpath ${SRC}/../../bin/enebular-pelion-agent`

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

BIN='DEBUG="debug" ENEBULAR_PELION_CONNECTOR_PATH="enebular-pelion-connector-path-overide" NODE_RED_COMMAND="./node_modules/.bin/node-red -s .node-red-config/settings.js -p 5001" '${AGENT_BIN}''
run "$BIN" 5
exists "agent takes ENEBULAR_PELION_CONNECTOR_PATH env" "enebular-pelion-connector-path-overide"

BIN='DEBUG="debug" ENEBULAR_LOCAL_CONNECTOR_SOCKET_PATH="enebular-local-connector-socket-path-overide" NODE_RED_COMMAND="./node_modules/.bin/node-red -s .node-red-config/settings.js -p 5002" '${AGENT_BIN}''
run "$BIN" 5
exists "agent takes ENEBULAR_LOCAL_CONNECTOR_SOCKET_PATH env" "enebular-local-connector-socket-path-overide"
