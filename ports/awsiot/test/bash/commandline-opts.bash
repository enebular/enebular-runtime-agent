#!/bin/bash
SRC=$(cd $(dirname "$0"); pwd)
source "${SRC}/include.bash"

AGENT_BIN=`realpath ${SRC}/../../bin/enebular-awsiot-agent`

BIN='DEBUG="debug" '${AGENT_BIN}' --node-red-dir="/node-red-dir-overide"'
run "$BIN"
exists "agent takes --node-red-dir option" "node-red-dir-overide"

BIN='DEBUG="debug" '${AGENT_BIN}' --node-red-data-dir="/node-red-data-dir-overide"'
run "$BIN"
exists "agent takes --node-red-data-dir option" "node-red-data-dir-overide"

BIN='DEBUG="debug" '${AGENT_BIN}' --node-red-command="/node-red-command-overide"'
run "$BIN"
exists "agent takes --node-red-command option" "node-red-command-overide"

BIN='DEBUG="debug" '${AGENT_BIN}' --enebular-config-file="/enebular-config-file-overide"'
run "$BIN"
exists "agent takes enebular-config-file option" "enebular-config-file-overide"
