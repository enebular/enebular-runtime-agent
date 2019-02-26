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

UPDATER_DOWNLOAD_URL="https://s3-ap-southeast-2.amazonaws.com/enebular-agent-update-youxin-test/enebular-agent-updater-release.tar.gz"
USER=enebular

for i in "$@"
do
case $i in
  --user=*)
  USER="${i#*=}"
  shift
  ;;
  --updater-download-path=*)
  UPDATER_DOWNLOAD_URL="${i#*=}"
  shift
  ;;
  --agent-download-url=*)
  AGENT_DOWNLOAD_URL="${i#*=}"
  shift
  ;;
  *)
  # unknown option
  _echo "Unknown option: ${i}"
  _exit 1
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

TEMP_UPDATER_TARBALL=`mktemp --dry-run /tmp/enebular-agent-updater.XXXXXXXXX.tar.gz`
_task "Downloading enebular-agent-updater from ${UPDATER_DOWNLOAD_URL}"
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

if [ ! -z ${USER} ]; then
  UPDATER_PARAMETER="--user=${USER}"
fi
if [ ! -z ${AGENT_DOWNLOAD_URL} ]; then
  UPDATER_PARAMETER="--agent-download-url=${AGENT_DOWNLOAD_URL} ${UPDATER_PARAMETER}"
fi

NODEJS_ENV=`systemctl show --no-pager -p Environment --value enebular-agent-${USER}.service`
export ${NODEJS_ENV}
${TEMP_UPDATER_DST}/bin/enebular-agent-update ${UPDATER_PARAMETER}



