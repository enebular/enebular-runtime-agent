#!/bin/bash
SRC=$(cd $(dirname "$0"); pwd)
source "${SRC}/include.bash"

AGENT_BIN=`realpath ${SRC}/../../bin/enebular-local-agent`

BIN='DEBUG="debug" '${AGENT_BIN}' --node-red-dir="/node-red-dir-override"'
run "$BIN"
exists "agent takes --node-red-dir option" "node-red-dir-override"

BIN='DEBUG="debug" '${AGENT_BIN}' --node-red-data-dir="/node-red-data-dir-override"'
run "$BIN"
exists "agent takes --node-red-data-dir option" "node-red-data-dir-override"

BIN='DEBUG="debug" '${AGENT_BIN}' --node-red-command="/node-red-command-override"'
run "$BIN"
exists "agent takes --node-red-command option" "node-red-command-override"

BIN='DEBUG="debug" '${AGENT_BIN}' --enebular-config-file="/enebular-config-file-override"'
run "$BIN"
exists "agent takes enebular-config-file option" "enebular-config-file-override"
