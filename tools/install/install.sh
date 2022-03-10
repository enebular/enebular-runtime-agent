#!/bin/bash
_echo() {
  printf %s\\n "$*" 2>/dev/null
  echo $@ >> ${LOG_FILE}
}

_echo_g() {
  echo -e "\033[32m"$@"\033[0m"
  echo $@ >> ${LOG_FILE}
}

_horizontal_bar() {
  local var="$*"
  local padding=`expr $(tput cols) - ${#var}`
  printf "%s" "$*" 2>/dev/null
  printf '%*s\n' "${COLUMNS:-${padding}}" '' | tr ' ' =
  echo "===============================" >> ${LOG_FILE}
}

_task() {
  _echo "==== "$*" ===="
}

_exit() {
  _echo "See details in full install log file: ${LOG_FILE}"
  exit $1
}

_err() {
  >&2 echo -e "\033[31mERROR: $@\033[0m"
  echo $@ >> ${LOG_FILE}
}

has() {
  type "$1" > /dev/null 2>&1
  return $?
}

setval() {
  printf -v "$1" "%s" "$(cat | base64 -w0)"; declare -p "$1";
  eval out='$'$1
  echo $out | base64 -w0 -d >> ${LOG_FILE}
}

create_log() {
  mktemp /tmp/enebular-agent-install-log.XXXXXX
}

cmd_wrapper() {
  echo "$@" >> ${LOG_FILE}
  if [ -z ${VERBOSE} ]; then
    eval "$( "$@" 2> >(setval err) > >(setval out); ret=$?; declare -p ret; )"
    if [ $ret -ne 0 ]; then
      _err  "  Command return error($ret): "$@""
      _err  "  Stdout: $(echo $out | base64 -w0 -d)"
      _err  "  Stderr: $(echo $err| base64 -w0 -d)"
    fi 
    return $ret
  else
    "$@"
  fi
}

download() {
  if has "curl"; then
    curl -SL -f -o $2 $1
  elif has "wget"; then
    wget -q -O $2 $1
  fi
}

run_as_user() {
  sudo -H -u $1 env $3 /bin/bash -c "$2"
}

get_os() {
  local UNAME
  UNAME="$(uname -a)"
  local OS
  case "$UNAME" in
    Linux\ *) OS=linux ;;
    Darwin\ *) OS=darwin ;;
  esac
  echo "${OS-}"
}

get_arch() {
  local HOST_ARCH
  HOST_ARCH="$(uname -m)"

  local ARCH
  case "$HOST_ARCH" in
    x86_64 | amd64) ARCH="x64" ;;
    i*86) ARCH="x86" ;;
    aarch64) ARCH="arm64" ;;
    *) ARCH="$HOST_ARCH" ;;
  esac
  echo "${ARCH}"
}

is_raspberry_pi() {
  local OUT
  OUT=`uname -n | grep -o "raspberrypi" | wc -l`
  if [ $OUT -eq 0 ]; then
    [ ! -f '/proc/device-tree/model' ] && return 1
    OUT=`cat /proc/device-tree/model | grep -o "Raspberry Pi" | wc -l`
    [ $OUT -eq 0 ] || return 0
    return 1
  else
    return 0
  fi
}

#args: url, file_name
get_node_checksum() {
  download "${1-}" "-" | command awk "{ if (\"${2-}\" == \$2) print \$1}"
}

get_version_info_from_s3() {
  download "${1-}" "-" | grep -e version | sed -E 's/.*"([^"]+)".*/\1/' | xargs
}

#args: install path
get_enebular_agent_package_version() {
  cat ${1-}/agent/package.json | grep version | sed -E 's/.*"([^"]+)".*/\1/'
}

#args: file_name
compute_checksum() {
  command sha256sum "${1-}" | command awk "{print \$1}"
}

#args: file_name, checksum
compare_checksum() {
  local FILE
  FILE="${1-}"
  if [ -z "${FILE}" ]; then
    _err 'Provided file to checksum is empty.'
    return 4
  elif ! [ -f "${FILE}" ]; then
    _err 'Provided file to checksum does not exist.'
    return 3
  fi

  local COMPUTED_SUM
  COMPUTED_SUM="$(compute_checksum "${FILE}")" >/dev/null 2>&1

  local CHECKSUM
  CHECKSUM="${2-}"
  if [ -z "${CHECKSUM}" ]; then
    _err 'Provided checksum to compare to is empty.'
    return 2
  fi

  if [ "${COMPUTED_SUM}" != "${CHECKSUM}" ]; then
    _err "Checksums do not match: ${COMPUTED_SUM} found, ${CHECKSUM} expected."
    return 1
  fi
}

# args: kind, version
get_download_file_name() {
  local NAME
  NAME="${1-}"

  local KIND
  case "${2-}" in
    binary | prebuilt | source) KIND="${2}" ;;
    *)
      _err 'supported kinds: binary, prebuilt, source'
      return 1
    ;;
  esac

  local VERSION
  VERSION="${3-}"

  if [ -z "${VERSION}" ]; then
    _err 'A version number is required.'
    return 2
  fi

  local COMPRESSION="tar.gz"

  if [ "${KIND}" = 'binary' ]; then
    local OS
    OS="$(get_os)"
    if [ -z "${OS}" ]; then
      _err 'Unsupported OS.'
      return 3
    fi
    local ARCH
    ARCH="$(get_arch)"
    echo "${NAME}-${VERSION}-${OS}-${ARCH}.${COMPRESSION}"
  elif [ "${KIND}" = 'prebuilt' ]; then
    echo "${NAME}-${VERSION}-prebuilt.${COMPRESSION}"
  elif [ "${KIND}" = 'source' ]; then
    echo "${NAME}-${VERSION}.${COMPRESSION}"
  fi
}

# args: version, destination
install_nodejs() {
  local VERSION
  VERSION="${1}"

  if [ -z "${VERSION}" ]; then
    _err "A version is required"
    return 1
  fi

  local DST
  DST="${2}"

  if [ -z "${DST}" ]; then
    _err "A destination is required"
    return 2
  fi

  _task "Checking existing node.js ${VERSION} installation"
  if [ -d "${DST}" ]; then
    _echo "Node.js ${VERSION} is already installed"
    _echo_g "OK"
    return 0
  fi
  _echo_g "OK"

  local TEMP_NODE_GZ
  TEMP_NODE_GZ=`mktemp --dry-run /tmp/nodejs.XXXXXXXXX`
  local DOWNLOAD_PATH
  DOWNLOAD_PATH="https://nodejs.org/dist/${VERSION}/"
  local DOWNLOAD_FILE_NAME
  DOWNLOAD_FILE_NAME="$(get_download_file_name "node" "binary" "${VERSION}")"
  local DOWNLOAD_URL
  DOWNLOAD_URL="${DOWNLOAD_PATH}${DOWNLOAD_FILE_NAME}"
  if [ -z "${DOWNLOAD_URL}" ]; then
    return 3
  fi

  _task "Downloading ${DOWNLOAD_URL}"
  if ! (
    proc_retry \
    "download ${DOWNLOAD_URL} ${TEMP_NODE_GZ}" \
    "_err Download ${DOWNLOAD_URL} failed"
  ); then
    return 4
  fi
  _echo_g "OK"

  _task "Checking integrity"
  local CHECKSUM
  CHECKSUM="$(get_node_checksum "${DOWNLOAD_PATH}SHASUMS256.txt" "${DOWNLOAD_FILE_NAME}")"
  if ! compare_checksum "${TEMP_NODE_GZ}" "${CHECKSUM}"; then
    return 5
  fi
  _echo_g "OK"

  _task "Installing Node.js ${VERSION} to ${DST}"
  if (
    run_as_user ${USER} "mkdir -p "${DST}"" && \
    run_as_user ${USER} "tar -xzf "${TEMP_NODE_GZ}" -C "${DST}" --strip-components 1" && \
    rm -f "${TEMP_NODE_GZ}"
  ); then
    _echo_g "OK"
    return 0
  fi 
}

# args: node_path_to_return
ensure_nodejs_version() {
  _task "Checking node.js version"
  if has "node" && has "npm"; then
    local VERSION_ALLOWED
    VERSION_ALLOWED="${SUPPORTED_NODE_VERSION}"
    local INSTALLED_NODE_VERSION
    INSTALLED_NODE_VERSION=`nodejs -v`
    if [ "${INSTALLED_NODE_VERSION}" == "${VERSION_ALLOWED}" ]; then
      NODE_PATH=`which node`
      NODE_PATH=${NODE_PATH%/*}
    else
      _echo "Found Node.js version: "${INSTALLED_NODE_VERSION}, \
          "but "${VERSION_ALLOWED}" is required."
    fi
  fi
  _echo_g "OK"

  if [ -z "${NODE_PATH}" ]; then
    local NODE_VERSION
    NODE_VERSION="${SUPPORTED_NODE_VERSION}"
    UPDATER_NODE_PATH="/home/${USER}/nodejs-${NODE_VERSION}"
    install_nodejs "${NODE_VERSION}" "${UPDATER_NODE_PATH}"
    EXIT_CODE=$?
    if [ "$EXIT_CODE" -ne 0 ]; then
      _err "Node installation failed"
      return 1
    fi
    NODE_PATH="${UPDATER_NODE_PATH}/bin"
  fi
  eval "$1='${NODE_PATH}'"
}

#args: version, url(out), kind(out), version(out)
get_download_info_s3() {
  local RELEASE_VERSION
  RELEASE_VERSION="${1-}"
  if [ -z "${RELEASE_VERSION}" ]; then
    _err "Missing release version."
    return 1
  fi
  local URL="${2-}"
  local VERSION="${3-}"

  local VERSION_INFO
  local DOWNLOAD_PATH
  DOWNLOAD_PATH=${UPDATER_DOWNLOAD_PATH}
  if [ "${RELEASE_VERSION}" == "latest-release" ]; then
    VERSION_INFO="$(get_version_info_from_s3 ${UPDATER_DOWNLOAD_PATH}/latest.info)"
    if [ -z "${VERSION_INFO}" ]; then
      _err "Failed to get latest version info."
      return 2
    fi
  else
    # regexp to match release version xx.xx.xx
    local RX
    RX='^([0-9]+\.){0,2}(\*|[0-9]+)$'
    if ! [[ "${RELEASE_VERSION}" =~ ${RX} ]]; then
      DOWNLOAD_PATH=${UPDATER_TEST_DOWNLOAD_PATH}
    fi
    VERSION_INFO=${RELEASE_VERSION}
  fi

  local DOWNLOAD_FILE_NAME
  DOWNLOAD_FILE_NAME="enebular-agent-updater-${VERSION_INFO}.tar.gz"
  local _DOWNLOAD_URL
  local _INSTALL_KIND
  _DOWNLOAD_URL="${DOWNLOAD_PATH}/${VERSION_INFO}/${DOWNLOAD_FILE_NAME}"
  _INSTALL_KIND="prebuilt"
  eval ${URL}="'${_DOWNLOAD_URL}'"
  eval ${VERSION}="'${VERSION_INFO}'"
}

#args: command, error commond, retry count max, delay
proc_retry() {
  local retry_count_max
  retry_count_max=${3:-3}
  local delay
  delay=${4:-3}

  local i
  for ((i = 0; i <= 3; i++)); do
    if ! eval $1; then
      eval $2
    else
      break
    fi
    if [ $i -lt ${retry_count_max} ]; then
      _echo "Retry count $((i + 1)). Retry processing after ${delay} seconds"
      sleep ${delay}
    fi
  done
  if [ $i -le ${retry_count_max} ]; then
    return 0
  else
    _err "Exit retry"
    return 1
  fi
}

#args: user, install_dir, release_version, node_env_path(return value)
do_install() {
  local USER
  USER="${1-}"
  if [ -z "${USER}" ]; then
    _err "Missing user."
    _exit 1
  fi
  local INSTALL_DIR
  INSTALL_DIR="${2-}"
  if [ -z "${INSTALL_DIR}" ]; then
    _err "Missing install directory."
    _exit 1
  fi
  local RELEASE_VERSION
  RELEASE_VERSION="${3-}"
  if [ -z "${RELEASE_VERSION}" ]; then
    _err "Missing release version."
    _exit 1
  fi

  _horizontal_bar
  _echo " $(_echo_g "enebular-agent installation:")"
  _echo "   - Device name:         $(uname -n)"
  _echo "   - System:              $(uname -srmo)"
  _echo "   - Install user:        ${USER}"
  _echo "   - Install destination: ${INSTALL_DIR}"
  _echo "   - Agent version:       ${RELEASE_VERSION}"
  _horizontal_bar

  local EXIT_CODE
  if ! id -u ${USER} > /dev/null 2>&1; then
    _task "Creating user ${USER}"
    useradd -m ${USER}
    EXIT_CODE=$?
    if [ "$EXIT_CODE" -ne 0 ]; then
      _err "Can't create user: ${USER}"
      _exit 1
    fi
    _echo_g OK
  fi

  TEMP_UPDATER_TARBALL=`mktemp --dry-run /tmp/enebular-agent-updater.XXXXXXXXX.tar.gz`
  _task "Fetching updater version info"
  get_download_info_s3 ${UPDATER_VERSION} UPDATER_DOWNLOAD_URL ACTUAL_VERSION
  EXIT_CODE=$?
  if [ "$EXIT_CODE" -ne 0 ]; then
    _err "Failed to get latest version info."
    _exit 1
  fi
  _echo_g "OK"

  _task "Downloading updater version ${ACTUAL_VERSION}"

  if ! (
    proc_retry \
    "download ${UPDATER_DOWNLOAD_URL} ${TEMP_UPDATER_TARBALL}" \
    "_err Download ${UPDATER_DOWNLOAD_URL} failed"
  ); then
    _exit 1
  fi
  tar -tzf ${TEMP_UPDATER_TARBALL} >/dev/null 
  if [ "$?" -ne 0 ]; then
    _err "Tarball integrity check failed."
    _exit 1
  fi
  _echo_g "OK"

  TEMP_UPDATER_DST=`mktemp --dry-run /tmp/enebular-agent-updater.XXXXXXXXX`
  _task "Installing enebular-agent-updater to ${TEMP_UPDATER_DST}"
  if (
    mkdir -p "${TEMP_UPDATER_DST}" && \
    tar -xzf "${TEMP_UPDATER_TARBALL}" -C "${TEMP_UPDATER_DST}" --strip-components 1 && \
    rm -f "${TEMP_UPDATER_TARBALL}"
  ); then
    _echo_g "OK"
  fi 

  NODE_STR=`grep \"node\": ${TEMP_UPDATER_DST}/package.json`
  NODE_STR=${NODE_STR#*:}
  NODE_STR=${NODE_STR#*\"}
  NODE_STR=${NODE_STR%*\"}
  SUPPORTED_NODE_VERSION=v${NODE_STR}
  ensure_nodejs_version NODE_PATH
  EXIT_CODE=$?
  if [ "$EXIT_CODE" -ne 0 ]; then
    _err "No suitable Node.js can be installed"
    _exit 1
  fi

  if [ "${RELEASE_VERSION}" == "latest-release" ]; then
    RELEASE_VERSION="latest"
  fi
  if [ ! -z ${VERBOSE} ]; then
    DEBUG_ENV="DEBUG=debug"
  fi

  declare -a UPDATER_PARAMETER

  if [ ! -z ${GITHUB_API_PATH} ]; then
    UPDATER_PARAMETER+=("--github-api-path=${GITHUB_API_PATH}")
  fi
  if [ ! -z ${AGENT_DOWNLOAD_PATH} ]; then
    UPDATER_PARAMETER+=("--agent-download-path=${AGENT_DOWNLOAD_PATH}")
  fi
  if [ ! -z ${AGENT_TEST_DOWNLOAD_PATH} ]; then
    UPDATER_PARAMETER+=("--agent-test-download-path=${AGENT_TEST_DOWNLOAD_PATH}")
  fi
  if [ ! -z ${REMOTE_MAINTENANCE_USER_PASSWORD} ]; then
    UPDATER_PARAMETER+=("--remote-maintenance-user-password=${REMOTE_MAINTENANCE_USER_PASSWORD}")
  fi

  local NODE_ENV
  NODE_ENV="PATH=${NODE_PATH}:/bin:/sbin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin"

  env ENEBULAR_AGENT_UPDATER_LOG_FILE=${LOG_FILE} ${NODE_ENV} ${DEBUG_ENV} \
    /bin/bash -c "${TEMP_UPDATER_DST}/bin/enebular-agent-update install "${INSTALL_DIR}" \
    --user=${USER} --release-version=${RELEASE_VERSION} ${UPDATER_PARAMETER[*]}"
  if [ "$?" -ne 0 ]; then
    _err "Updater install failed."
    _exit 1
  fi
  if [ ! -z ${AWS_IOT_THING_NAME} ]; then
    _task Creating AWS IoT thing
    if [ -d ${TEMP_UPDATER_DST}/awsiot-thing-creator ]; then
      if ! (
        proc_retry \
          'cmd_wrapper run_as_user "${USER}" "(cd ${TEMP_UPDATER_DST}/awsiot-thing-creator && npm run start)"
          "${NODE_ENV}
          AWS_IOT_THING_NAME=${AWS_IOT_THING_NAME} AWS_IOT_REGION=${AWS_IOT_REGION}
          AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID} AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
          AWS_IOT_CONFIG_SAVE_PATH=${INSTALL_DIR}/ports/awsiot"' \
          '_err Creating AWS IoT thing failed.'
      ); then
        _exit 1
      fi
    else
      if ! (
        proc_retry \
          'cmd_wrapper run_as_user "${USER}" "(cd ${INSTALL_DIR}/tools/awsiot-thing-creator && npm run start)"
          "${NODE_ENV}
          AWS_IOT_THING_NAME=${AWS_IOT_THING_NAME} AWS_IOT_REGION=${AWS_IOT_REGION}
          AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID} AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}"' \
         '_err Creating AWS IoT thing failed.'
      ); then
        _exit 1
      fi
    fi
    _echo_g "OK"
  fi
  rm -rf "${TEMP_UPDATER_DST}"
  eval "$5='${NODE_ENV}'"
}

post_install() {
  if is_raspberry_pi; then
    _task "Adding ${USER} to gpio group"
    local GROUP_OUT
    local GROUP_EXISTS
    local USER_ADDED
    GROUP_OUT=`getent group gpio`
    GROUP_EXISTS=`echo ${GROUP_OUT} | wc -l`
    USER_ADDED=`echo ${GROUP_OUT} | grep -o "${USER}" | wc -l`
    if [ $GROUP_EXISTS -eq 1 ] && [ $USER_ADDED -eq 0 ]; then
      adduser ${USER} gpio > /dev/null 2>&1
      EXIT_CODE=$?
      if [ "$EXIT_CODE" -ne 0 ]; then
        _err "Adding ${USER} to gpio group failed."
      fi
    fi
    _echo_g "OK"
  fi
  if [ ! -z ${LICENSE_KEY} ]; then
    _task "Creating activation configuration file"
    cmd_wrapper run_as_user ${USER} 'echo "{\"enebularBaseURL\": \"'${ENEBULAR_BASE_URL}'\",\"licenseKey\": \"'${LICENSE_KEY}'\"}" \
      > "'${INSTALL_DIR}'/ports/awsiot/.enebular-activation-config.json"'
    _echo_g "OK"
  fi

  if [ -z ${NO_STARTUP_REGISTER} ]; then
    _task "Registering startup service"
    local LAUNCH_ENV
    LAUNCH_ENV=`grep \"node\": ${INSTALL_DIR}/agent/package.json`
    LAUNCH_ENV=${LAUNCH_ENV#*:}
    LAUNCH_ENV=${LAUNCH_ENV#*\"}
    LAUNCH_ENV=${LAUNCH_ENV%*\"}
    if [ -z ${LAUNCH_ENV} ]; then
      LAUNCH_ENV="9.2.1"
    fi
    LAUNCH_ENV="/home/${USER}/nodejs-v${LAUNCH_ENV}/bin"
    LAUNCH_ENV="PATH=${LAUNCH_ENV}:/bin:/sbin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin"
    if [ ! ${LAUNCH_ENV} == ${NODE_ENV_PATH} ]; then
      rm -rf "${UPDATER_NODE_PATH}"
    fi
    if [ ! -z ${ENEBULAR_DEV_MODE} ]; then
      LAUNCH_ENV="${LAUNCH_ENV} ENEBULAR_DEV_MODE=true"
    fi
    cmd_wrapper bash -c "${LAUNCH_ENV} ${INSTALL_DIR}/ports/awsiot/bin/enebular-awsiot-agent \
      startup-register -u ${USER}"
    EXIT_CODE=$?
    if [ "$EXIT_CODE" -ne 0 ]; then
      _err "Registering startup service failed."
      _exit 1
    fi
    _echo_g "OK"
  fi
}

USER=enebular
RELEASE_VERSION="latest-release"
SUPPORTED_NODE_VERSION="v12.22.10"
ENEBULAR_BASE_URL="https://enebular.com/api/v1"

UPDATER_DOWNLOAD_PATH="https://s3-ap-northeast-1.amazonaws.com/download.enebular.com/enebular-agent"
UPDATER_TEST_DOWNLOAD_PATH="https://s3-ap-northeast-1.amazonaws.com/download.enebular.com/enebular-agent-staging"
UPDATER_VERSION="latest-release"

LOG_FILE="$(create_log)"
chmod +r ${LOG_FILE}

for i in "$@"
do
case $i in
  -u=*|--user=*)
  USER="${i#*=}"
  shift
  ;;
  -d=*|--install-dir=*)
  INSTALL_DIR="${i#*=}"
  shift
  ;;
  -v=*|--release-version=*)
  RELEASE_VERSION="${i#*=}"
  shift
  ;;
  --verbose)
  VERBOSE=yes
  shift
  ;;
  --no-startup-register)
  NO_STARTUP_REGISTER=yes
  shift
  ;;
  --aws-access-key-id=*)
  AWS_ACCESS_KEY_ID="${i#*=}"
  shift
  ;;
  --aws-secret-access-key=*)
  AWS_SECRET_ACCESS_KEY="${i#*=}"
  shift
  ;;
  --aws-iot-region=*)
  AWS_IOT_REGION="${i#*=}"
  shift
  ;;
  --aws-iot-thing-name=*)
  AWS_IOT_THING_NAME="${i#*=}"
  shift
  ;;
  --github-api-path=*)
  GITHUB_API_PATH="${i#*=}"
  shift
  ;;
  --agent-download-path=*)
  AGENT_DOWNLOAD_PATH="${i#*=}"
  shift
  ;;
  --agent-test-download-path=*)
  AGENT_TEST_DOWNLOAD_PATH="${i#*=}"
  shift
  ;;
  --license-key=*)
  LICENSE_KEY="${i#*=}"
  shift
  ;;
  --enebular-base-url=*)
  ENEBULAR_BASE_URL="${i#*=}"
  shift
  ;;
  --dev-mode)
  ENEBULAR_DEV_MODE=yes
  shift
  ;;
  --download-agent-from-github)
  DOWNLOAD_AGENT_FROM_GTIHUB=yes
  shift
  ;;
  --updater-download-path=*)
  UPDATER_DOWNLOAD_PATH="${i#*=}"
  shift
  ;;
  --updater-test-download-path=*)
  UPDATER_TEST_DOWNLOAD_PATH="${i#*=}"
  shift
  ;;
  --updater-version=*)
  UPDATER_VERSION="${i#*=}"
  shift
  ;;
  --remote-maintenance-user-password=*)
  REMOTE_MAINTENANCE_USER_PASSWORD="${i#*=}"
  shift
  ;;
  *)
  # unknown option
  _echo "Unknown option: ${i}"
  _exit 1
  ;;
esac
done

"$@" >> ${LOG_FILE}

if ! has "curl" && ! has "wget"; then
  _err "You need curl or wget to proceed"
  _exit 1
fi
if ! has "tar"; then
  _err "You need tar to proceed"
  _exit 1
fi

if [ -z ${INSTALL_DIR} ]; then
  INSTALL_DIR=/home/${USER}/enebular-runtime-agent
fi

# if user specified thing name, we assume thing creation is wanted.
if [ ! -z ${AWS_IOT_THING_NAME} ]; then
    if [ -z ${AWS_ACCESS_KEY_ID} ]; then
      _echo "aws-access-key-id is required" && _exit 1
    fi
    if [ -z ${AWS_SECRET_ACCESS_KEY} ]; then
      _echo "aws-secret-access-key is required" && _exit 1
    fi
    if [ -z ${AWS_IOT_REGION} ]; then
      _echo "aws-iot-region is required" && _exit 1
    fi
    if [ -z ${AWS_IOT_THING_NAME} ]; then
      _echo "aws-iot-thing-name is required" && _exit 1
    fi
fi

do_install "${USER}" "${INSTALL_DIR}" "${RELEASE_VERSION}" NODE_ENV_PATH

post_install

_horizontal_bar
echo -e "\033[32m enebular-agent has been successfully installed ✔\033[0m"
_echo "   - Version: $(get_enebular_agent_package_version ${INSTALL_DIR})"
_echo "   - Location: ${INSTALL_DIR}"
_echo "   - User: ${USER}"
_echo "   - Service name: enebular-agent-${USER}"
_echo ""
if [ ! -z ${AWS_IOT_THING_NAME} ]; then
  echo -e " AWS IoT Thing \033[32m${AWS_IOT_THING_NAME}\033[0m has been created."
fi
if [ -z ${NO_STARTUP_REGISTER} ]; then
  _echo " enebular-agent is running as a system service."
  _echo " To check the status of agent, run the following command on the target device:"
  _echo "   sudo journalctl -ex -u enebular-agent-${USER}.service"
fi
_horizontal_bar
_exit 0
