#!/bin/bash
_echo() {
  printf %s\\n "$*" 2>/dev/null
}

_echo_g() {
  echo -e "\033[32m"$@"\033[0m"
}

_task() {
  _echo "==== "$*" ===="
}

_exit() {
  exit $1
}

_err() {
  >&2 echo -e "\033[31mERROR: $@\033[0m"
}

has() {
  type "$1" > /dev/null 2>&1
  return $?
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

  local DPKG_ARCH
  DPKG_ARCH="$(dpkg --print-architecture)"

  if [ -n "$DPKG_ARCH" ]; then
    case "$DPKG_ARCH" in
      amd64) HOST_ARCH="x86_64" ;;
      arm64) HOST_ARCH="aarch64" ;;
      armhf) HOST_ARCH="armv7l" ;;
      armel) HOST_ARCH="armv6l" ;;
    esac
  fi

  local ARCH
  case "$HOST_ARCH" in
    x86_64 | amd64) ARCH="x64" ;;
    i*86) ARCH="x86" ;;
    aarch64) ARCH="arm64" ;;
    *) ARCH="$HOST_ARCH" ;;
  esac
  echo "${ARCH}"
}

#args: url, file_name
get_node_checksum() {
  download "${1-}" "-" | command awk "{ if (\"${2-}\" == \$2) print \$1}"
}

get_version_info_from_s3() {
  download "${1-}" "-" | grep -e version | sed -E 's/.*"([^"]+)".*/\1/' | xargs
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

# args: kind, version
get_node_download_file_name() {
  local KIND
  case "${1-}" in
    binary | source) KIND="${1}" ;;
    *)
      _err 'supported kinds: binary, source'
      return 1
    ;;
  esac

  local VERSION
  VERSION="${2-}"

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
      return 4
    fi
    local ARCH
    ARCH="$(get_arch)"
    echo "node-${VERSION}-${OS}-${ARCH}.${COMPRESSION}"
  elif [ "${KIND}" = 'source' ]; then
    echo "node-${VERSION}.${COMPRESSION}"
  fi
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

  if [ -d "${DST}" ]; then
    _echo "Node.js ${VERSION} is already installed"
    return 0
  fi

  local TEMP_NODE_GZ
  TEMP_NODE_GZ=`mktemp --dry-run /tmp/nodejs.XXXXXXXXX`
  local DOWNLOAD_PATH
  DOWNLOAD_PATH="https://nodejs.org/dist/${VERSION}/"
  local DOWNLOAD_FILE_NAME
  DOWNLOAD_FILE_NAME="$(get_node_download_file_name "binary" "${VERSION}")"
  local DOWNLOAD_URL
  DOWNLOAD_URL="${DOWNLOAD_PATH}${DOWNLOAD_FILE_NAME}"
  if [ -z "${DOWNLOAD_URL}" ]; then
    return 3
  fi

  _task "Downloading ${DOWNLOAD_URL}"
  if ! download ${DOWNLOAD_URL} ${TEMP_NODE_GZ}; then 
    _err "Download ${DOWNLOAD_URL} failed"
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
    local NODE_VERSION_PATH
    NODE_VERSION_PATH="/home/${USER}/nodejs-${NODE_VERSION}"
    install_nodejs "${NODE_VERSION}" "${NODE_VERSION_PATH}"
    EXIT_CODE=$?
    if [ "$EXIT_CODE" -ne 0 ]; then
      _err "Node installation failed"
      return 1
    fi
    NODE_PATH="${NODE_VERSION_PATH}/bin"
  fi
  eval "$1='${NODE_PATH}'"
}

UPDATER_DOWNLOAD_PATH="https://s3-ap-northeast-1.amazonaws.com/download.enebular.com/enebular-agent"
UPDATER_TEST_DOWNLOAD_PATH="https://s3-ap-northeast-1.amazonaws.com/download.enebular.com/enebular-agent-staging"
UPDATER_VERSION=latest-release
USER=enebular

declare -a UPDATER_PARAMETER
for i in "$@"
do
case $i in
  --user=*)
  USER="${i#*=}"
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
  *)
  UPDATER_PARAMETER+=(${i})
  ;;
esac
done

if ! has "curl" && ! has "wget"; then
  _err "You need curl or wget to proceed"
  _exit 1
fi
if ! has "tar"; then
  _err "You need tar to proceed"
  _exit 1
fi

if ! id -u ${USER} > /dev/null 2>&1; then
  _err "User ${USER}: no such user"
  _exit 1
fi

TEMP_UPDATER_TARBALL=`mktemp --dry-run /tmp/enebular-agent-updater.XXXXXXXXX.tar.gz`
_task "Fetching updater version info"
get_download_info_s3 ${UPDATER_VERSION} UPDATER_DOWNLOAD_URL ACTUAL_VERSION
EXIT_CODE=$?
if [ "$EXIT_CODE" -ne 0 ]; then
  _err "Failed to get latest version info"
  _exit 1
fi
_echo_g "OK"

_task "Downloading updater version ${ACTUAL_VERSION}"
if ! download ${UPDATER_DOWNLOAD_URL} ${TEMP_UPDATER_TARBALL}; then 
  _err "Download ${UPDATER_DOWNLOAD_URL} failed"
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

UPDATER_PARAMETER+=("--user=${USER}")

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

export PATH=${NODE_PATH}:/bin:/sbin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin
${TEMP_UPDATER_DST}/bin/enebular-agent-update update ${UPDATER_PARAMETER[*]}
EXIT_CODE=$?
rm -rf "${TEMP_UPDATER_DST}"

_exit ${EXIT_CODE}

