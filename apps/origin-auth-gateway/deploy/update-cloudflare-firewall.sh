#!/bin/sh
set -eu

# Atomically replace only Vibrail's nftables table. Other firewall/SSH rules are
# untouched. This script deliberately does nothing unless explicitly enabled.
[ "${VIBRAIL_ENFORCE_CLOUDFLARE_FIREWALL:-false}" = "true" ] || exit 0
command -v curl >/dev/null
command -v nft >/dev/null

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT INT TERM
curl -fsS --proto '=https' --tlsv1.2 https://www.cloudflare.com/ips-v4 -o "$work_dir/ips-v4"
curl -fsS --proto '=https' --tlsv1.2 https://www.cloudflare.com/ips-v6 -o "$work_dir/ips-v6"

# Reject malformed/empty downloads before touching the active ruleset.
awk 'NF && $0 !~ /^[0-9.]+\/[0-9]+$/ { exit 1 } END { if (NR == 0) exit 1 }' "$work_dir/ips-v4"
awk 'NF && $0 !~ /^[0-9A-Fa-f:]+\/[0-9]+$/ { exit 1 } END { if (NR == 0) exit 1 }' "$work_dir/ips-v6"
v4="$(paste -sd, "$work_dir/ips-v4")"
v6="$(paste -sd, "$work_dir/ips-v6")"

cat >"$work_dir/rules.nft" <<EOF
table inet vibrail_cloudflare {
  set ipv4 { type ipv4_addr; flags interval; elements = { $v4 } }
  set ipv6 { type ipv6_addr; flags interval; elements = { $v6 } }
  chain input {
    type filter hook input priority -5; policy accept;
    tcp dport 443 ip saddr @ipv4 accept
    tcp dport 443 ip6 saddr @ipv6 accept
    tcp dport 443 drop
  }
}
EOF

# Validate first, then replace the dedicated table. The short interval between
# delete and load is fail-open, never an accidental host lockout.
nft -c -f "$work_dir/rules.nft"
nft delete table inet vibrail_cloudflare 2>/dev/null || true
nft -f "$work_dir/rules.nft"
