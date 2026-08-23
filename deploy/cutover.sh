#!/usr/bin/env bash
set -euo pipefail

xray_config=/usr/local/etc/xray/config.json
haproxy_config=/etc/haproxy/haproxy.cfg
next_xray=/tmp/escape-xray-next.json
next_haproxy=/tmp/escape-haproxy.cfg
backup_dir=/root/escape-deploy-backups/$(date -u +%Y%m%dT%H%M%SZ)
rollback_needed=0

rollback() {
    if [[ $rollback_needed -ne 1 ]]; then
        return
    fi

    systemctl stop haproxy || true
    install -m 640 -o root -g xray "$backup_dir/xray-config.json" "$xray_config"
    install -m 644 "$backup_dir/haproxy.cfg" "$haproxy_config"
    systemctl restart xray
    systemctl restart haproxy || true
}

trap rollback ERR

install -d -m 700 "$backup_dir"
install -m 600 "$xray_config" "$backup_dir/xray-config.json"
install -m 600 "$haproxy_config" "$backup_dir/haproxy.cfg"

umask 077
jq '(.inbounds[] | select(.tag == "vless-reality-in") | .listen) = "127.0.0.1" |
    (.inbounds[] | select(.tag == "vless-reality-in") | .port) = 8443' \
    "$xray_config" > "$next_xray"
chown root:xray "$next_xray"
chmod 640 "$next_xray"

/usr/local/bin/xray run -test -config "$next_xray"
haproxy -c -f "$next_haproxy"

install -m 640 -o root -g xray "$next_xray" "$xray_config"
install -m 644 "$next_haproxy" "$haproxy_config"
rollback_needed=1

systemctl restart xray
systemctl restart haproxy
systemctl is-active --quiet xray
systemctl is-active --quiet haproxy

rollback_needed=0
trap - ERR
rm -f -- "$next_xray"

printf 'Backup: %s\n' "$backup_dir"
systemctl is-active xray
systemctl is-active haproxy
ss -ltnp | grep -E ':(443|8443|8444) '
