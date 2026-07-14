#!/usr/bin/env bash
set -euo pipefail
release="${1:?release timestamp required}"
test -d "/opt/is2u/releases/$release"
cd "/opt/is2u/releases/$release/infra"
export IS2U_RELEASE="$release"
export IS2U_ENV_FILE=/opt/is2u/shared/.env
docker compose --env-file /opt/is2u/shared/.env up -d --no-build --remove-orphans
sudo ln -sfn "/opt/is2u/releases/$release" /opt/is2u/current
echo "ROLLED_BACK_RELEASE=$release"
