#!/bin/bash
SRC=$(cd $(dirname "$0"); pwd)
source "${SRC}/include.bash"

userdel -r enebular

\. ../install.sh

set -e
[ "${USER}" == "enebular" ] || fail "install user should default to enebular"
[ "${PORT}" == "awsiot" ] || fail "install port should default to awsiot"
[ "${INSTALL_DIR}" == "/home/enebular/enebular-runtime-agent" ] || fail "install \
      directory should default to /home/enebular/enebular-runtime-agent"

[ -z ${NO_STARTUP_REGISTER} ] || fail "startup register should enable by default"

OWNER=`ls -ld ${INSTALL_DIR} | awk '{print $3}'`
[ "${OWNER}" == "enebular" ] || fail "agent directory owner should default to enebular"

GLOBAL_NODE=`sudo -H -u ${USER} /bin/bash -c "node -v"`
echo ${GLOBAL_NODE}
[ "${GLOBAL_NODE}" == "v9.2.1" ] && fail "can't test node installation since it exists"
[ -d "/home/enebular/nodejs-v9.2.1" ] || fail "node v9.2.1 should be installed as default"

userdel -r ${USER}
success "Install defaults test passed"
