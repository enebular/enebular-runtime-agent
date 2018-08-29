#!/bin/bash
SRC=$(cd $(dirname "$0"); pwd)
source "${SRC}/include.bash"

TEST_USER=install-test
TEST_DIR=/home/${TEST_USER}/enebular-runtime-agent

\. ../install.sh --user=${TEST_USER}

set -e

[ -d ${TEST_DIR} ] || fail "${TEST_DIR} is not a directory"
[ -d ${TEST_DIR}/agent ] || fail "${TEST_DIR}/agent is not a directory"
[ -d ${TEST_DIR}/agent/node_modules ] || fail "${TEST_DIR}/agent/node_modules is not a directory"

OWNER=`ls -ld ${TEST_DIR} | awk '{print $3}'`
[ "${OWNER}" == "${TEST_USER}" ] || fail "agent directory owner should be ${TEST_USER}"

COUNT=`grep User=${TEST_USER} /etc/systemd/system/enebular-agent-${TEST_USER}.service | wc -l`
[ ${COUNT} -ge 1 ] || fail "user for startup should be ${TEST_USER}"

userdel -r ${TEST_USER}
success "Install user test passed"
