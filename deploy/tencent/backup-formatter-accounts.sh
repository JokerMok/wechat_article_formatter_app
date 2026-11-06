#!/bin/sh
set -eu
umask 077
out="${1:?Backup staging directory required}/formatter"
mkdir -p "$out"
archive="$out/formatter_accounts.dump"
docker exec zhenyi-accounts-postgres-1 pg_dump -U postgres --format=custom formatter_accounts > "$archive"
docker exec -i zhenyi-accounts-postgres-1 pg_restore --list < "$archive" > /dev/null
