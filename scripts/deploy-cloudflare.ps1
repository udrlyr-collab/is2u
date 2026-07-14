param(
  [string]$CloudflareEnv = (Join-Path $PSScriptRoot '..\cloudflare\cloudflare.env'),
  [string]$ServerEnv = "$HOME\.is2u\server.env"
)
$ErrorActionPreference = 'Stop'
function Read-DotEnv([string]$Path) {
  $result = @{}
  Get-Content -LiteralPath $Path | ForEach-Object { if ($_ -match '^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') { $result[$matches[1]] = $matches[2].Trim().Trim('"').Trim("'") } }
  return $result
}
$cf = Read-DotEnv $CloudflareEnv
$server = Read-DotEnv $ServerEnv
$env:CLOUDFLARE_ACCOUNT_ID = $cf.CLOUDFLARE_ACCOUNT_ID
$env:CLOUDFLARE_API_TOKEN = $cf.CLOUDFLARE_API_TOKEN
$zone = Invoke-RestMethod -Method Get -Uri "https://api.cloudflare.com/client/v4/zones/$($cf.CLOUDFLARE_ZONE_ID)" -Headers @{ Authorization = "Bearer $($cf.CLOUDFLARE_API_TOKEN)" }
if ($zone.result.status -ne 'active') { Write-Output "WORKER_SKIPPED_ZONE_STATUS=$($zone.result.status)"; exit 2 }
$server.MEDIA_TOKEN_SECRET | pnpm --dir apps/media-worker exec wrangler secret put MEDIA_TOKEN_SECRET | Out-Null
pnpm --dir apps/media-worker exec wrangler deploy
