#!/usr/bin/env bash
set -Eeuo pipefail
root=/srv/apps/formatter
unit=formatter.service
min_free=$((2 * 1024 * 1024 * 1024))
[[ $EUID == 0 ]] || { echo "Run with sudo" >&2; exit 1; }
exec 9>"$root/shared/config/release.lock"
flock -x 9

set_link() {
  local name=$1 target=$2
  ln -s "$target" "$root/.$name.$$"
  mv -Tf "$root/.$name.$$" "$root/$name"
}
health() {
  local attempt
  for ((attempt=0; attempt<20; attempt++)); do
    if curl -fsS --max-time 2 -o /dev/null http://127.0.0.1:18877/; then return 0; fi
    sleep 1
  done
  return 1
}
activate() {
  local next=$1 old
  old=$(readlink "$root/current" || true)
  [[ "$next" =~ ^releases/[a-f0-9]{40}$ && -f "$root/$next/RELEASE.json" ]]
  set_link current "$next"
  if systemctl restart "$unit" && health; then
    if [[ -n "$old" && "$old" != "$next" ]]; then set_link previous "$old"; fi
    systemctl enable "$unit"
    return
  fi
  if [[ -n "$old" ]]; then
    set_link current "$old"
    systemctl restart "$unit"
    health || true
  else
    systemctl stop "$unit"
    unlink "$root/current"
  fi
  echo "Candidate failed health check" >&2
  return 1
}
case ${1:-status} in
  install)
    archive=${2:?Archive required}
    expected=${3:?SHA-256 required}
    [[ "$archive" =~ ^/dev/shm/formatter-[a-f0-9]{40}\.[a-zA-Z0-9]+\.tar\.gz$ &&
       "$expected" =~ ^[a-f0-9]{64}$ && -f "$archive" && ! -L "$archive" ]]
    stage=$(mktemp -d "$root/releases/.incoming.XXXXXXXX")
    trap 'rm -rf -- "$stage"' EXIT
    git_sha=$(python3 - "$archive" "$expected" "$stage" "$min_free" <<'PY'
import hashlib, hmac, json, pathlib, re, shutil, sys, tarfile
archive, expected, directory, reserve = sys.argv[1:]
with open(archive, "rb") as stream:
    if not hmac.compare_digest(hashlib.file_digest(stream, "sha256").hexdigest(), expected):
        raise SystemExit("Archive checksum mismatch")
    stream.seek(0)
    with tarfile.open(fileobj=stream) as bundle:
        members = bundle.getmembers()
        allocated = sum(((m.size+4095)//4096)*4096+512 for m in members)
        if shutil.disk_usage(directory).free - allocated < int(reserve):
            raise SystemExit("Insufficient disk headroom for the 2 GiB backup reserve")
        for m in members:
            if not (m.isfile() or m.isdir() or m.islnk()):
                raise SystemExit("Unsupported archive entry")
        bundle.extractall(directory, filter="data")
sha = json.loads((pathlib.Path(directory) / "RELEASE.json").read_text())["git_sha"]
if not re.fullmatch(r"[a-f0-9]{40}", sha) or not pathlib.Path(archive).name.startswith("formatter-"+sha+"."):
    raise SystemExit("Invalid release SHA")
print(sha)
PY
)
    (cd "$stage" && sha256sum --strict -c SHA256SUMS >/dev/null)
    chmod 0755 "$stage"
    if [[ -e "$root/releases/$git_sha" ]]; then
      echo "Release already exists. Use activate $git_sha." >&2
      exit 1
    fi
    printf '%s\n' "$expected" > "$stage/ARTIFACT.sha256"
    mv "$stage" "$root/releases/$git_sha"
    activate "releases/$git_sha"
    ;;
  activate)
    sha=${2:?Git SHA required}
    [[ "$sha" =~ ^[a-f0-9]{40}$ ]]
    (cd "$root/releases/$sha" && sha256sum --strict -c SHA256SUMS >/dev/null)
    activate "releases/$sha"
    ;;
  rollback)
    [[ -L "$root/previous" ]] || { echo "No previous verified release" >&2; exit 1; }
    prior=$(readlink "$root/previous")
    [[ "$prior" =~ ^releases/[a-f0-9]{40}$ ]]
    (cd "$root/$prior" && sha256sum --strict -c SHA256SUMS >/dev/null)
    activate "$prior"
    ;;
  status)
    systemctl is-active "$unit"
    systemctl is-enabled "$unit"
    readlink "$root/current"
    if [[ -L "$root/previous" ]]; then readlink "$root/previous"; fi
    cat "$root/current/RELEASE.json" "$root/current/ARTIFACT.sha256"
    ;;
  *) echo "Usage: $0 {install ARCHIVE SHA256|activate GIT_SHA|rollback|status}" >&2; exit 2 ;;
esac
