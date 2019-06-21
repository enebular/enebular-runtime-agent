#!/bin/bash

_err() {
  >&2 echo $@
}

_echo() {
  echo $@
}

apply_patches() {
  local PATCH_PROJECT_PATH=$1
  local PATCH_DIR="${PATCH_PROJECT_PATH}/patches"

  if [ ! -d "${PATCH_DIR}" ]; then
    return 0
  fi

  _echo "Patching ${PATCH_PROJECT_PATH} ..."

  find ${PATCH_DIR} -type f -name "*.patch" | while read PATCH_FULL_PATH; do
    PATCH_RELATIVE_PATH=./${PATCH_FULL_PATH#"${PATCH_DIR}/"}
    _echo "Applying ${PATCH_RELATIVE_PATH}"
    patch -p1 -N --dry-run --silent -f -d ${PATCH_PROJECT_PATH} < ${PATCH_FULL_PATH} &>/dev/null
    if [ "$?" -ne 0 ]; then
      patch -p1 -R --dry-run --silent -f -d ${PATCH_PROJECT_PATH} < ${PATCH_FULL_PATH} &>/dev/null
      if [ "$?" -ne 0 ]; then
        _err "Patch cannot be applied"
        return 1
      else
        _echo "Patch already applied. Skipping..."
      fi
    else
      patch -p1 -N -f -d ${PATCH_PROJECT_PATH} < ${PATCH_FULL_PATH}
      if [ "$?" -ne 0 ]; then
        _err "Patch failed"
        return 1
      else
        _echo "Patch applied"
      fi
    fi
  done
}

BASE_DIR=$1
if [ ! -d "${BASE_DIR}" ]; then
  _err "Specified directory doesn't exist"
  exit 1
fi

apply_patches $BASE_DIR

exit "$?"
