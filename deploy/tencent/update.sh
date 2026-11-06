#!/usr/bin/env bash
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd -P)
work=$(mktemp -d "${TMPDIR:-/tmp}/formatter-transfer.XXXXXX")
remote=
cleanup() {
  if [[ -n "$remote" ]]; then ssh tencent-main "rm -f -- '$remote'" || true; fi
  rm -rf -- "$work"
}
trap cleanup EXIT
archive=$("$here/build.sh" "$work" "$@")
name=$(basename "$archive" .tar.gz)
checksum=$(awk '{print $1}' "$archive.sha256")
remote=$(ssh tencent-main "mktemp --suffix=.tar.gz /dev/shm/$name.XXXXXXXX")
scp "$archive" "tencent-main:$remote"
ssh tencent-main "sudo /srv/apps/formatter/shared/config/manage.sh install '$remote' '$checksum'"
