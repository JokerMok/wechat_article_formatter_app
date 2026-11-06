#!/usr/bin/env bash
set -euo pipefail
if [[ $# != 1 || $1 != --icp-verified ]]; then
  echo "Verify Tencent Cloud ICP access for shizibandu.icu, then pass --icp-verified." >&2
  exit 2
fi
domain=formatter.shizibandu.icu
ip=$(ssh tencent-main 'curl -fsS --max-time 5 http://metadata.tencentyun.com/latest/meta-data/public-ipv4')
[[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]
for ns in gift.dnspod.net pot.dnspod.net; do
  [[ $(dig @"$ns" "$domain" A +short +time=3 +tries=1) == "$ip" ]] ||
    { echo "A record at $ns does not match $ip" >&2; exit 1; }
  [[ -z $(dig @"$ns" "$domain" AAAA +short +time=3 +tries=1) ]]
  [[ -z $(dig @"$ns" "$domain" CNAME +short +time=3 +tries=1) ]]
done
ssh tencent-main 'sudo -n systemd-run --quiet --wait --collect   -p EnvironmentFile=/srv/apps/zhenwork/shared/config/edge.env   -p EnvironmentFile=/srv/apps/zhenwork/shared/config/monitor-proxy.env   /usr/local/sbin/caddy-site-install formatter /srv/apps/formatter/shared/config/site.caddy'
echo "Site loaded. Verify public DNS, HTTP redirect and trusted HTTPS before marking it online."
