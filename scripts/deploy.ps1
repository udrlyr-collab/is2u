param(
  [string]$HostAddress = '3.38.25.219',
  [string]$KeyPath = (Join-Path $HOME 'is2u_ssh\LightsailDefaultKey-ap-northeast-2.pem'),
  [string]$ServerEnv = "$HOME\.is2u\server.env"
)
$ErrorActionPreference = 'Stop'
$release = Get-Date -Format 'yyyyMMddHHmmss'
$archive = Join-Path $env:TEMP "is2u-$release.tar.gz"
tar.exe -czf $archive --exclude=.git --exclude=node_modules --exclude=.next --exclude=cloudflare --exclude=ssh --exclude=.secrets --exclude=coverage .
scp.exe -i $KeyPath -o BatchMode=yes $archive "ubuntu@${HostAddress}:/tmp/is2u-release.tar.gz"
scp.exe -i $KeyPath -o BatchMode=yes $ServerEnv "ubuntu@${HostAddress}:/tmp/is2u-server.env"
$command = @"
set -euo pipefail
release='$release'
sudo install -d -m 0750 -o ubuntu -g docker /opt/is2u/releases/`$release /opt/is2u/shared
sudo tar -xzf /tmp/is2u-release.tar.gz -C /opt/is2u/releases/`$release
sudo install -m 0640 -o ubuntu -g docker /tmp/is2u-server.env /opt/is2u/shared/.env
cd /opt/is2u/releases/`$release/infra
export IS2U_RELEASE=`$release
export IS2U_ENV_FILE=/opt/is2u/shared/.env
docker compose --env-file /opt/is2u/shared/.env build
docker compose --env-file /opt/is2u/shared/.env run --rm worker pnpm db:migrate
docker compose --env-file /opt/is2u/shared/.env run --rm worker pnpm db:seed
docker compose --env-file /opt/is2u/shared/.env up -d --remove-orphans
sudo ln -sfn /opt/is2u/releases/`$release /opt/is2u/current
rm -f /tmp/is2u-release.tar.gz /tmp/is2u-server.env
docker image prune -f >/dev/null
echo DEPLOYED_RELEASE=`$release
"@
ssh.exe -i $KeyPath -o BatchMode=yes "ubuntu@$HostAddress" $command
Remove-Item -LiteralPath $archive -Force
