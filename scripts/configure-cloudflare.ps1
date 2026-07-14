param(
  [string]$EnvFile = (Join-Path $PSScriptRoot '..\cloudflare\cloudflare.env')
)
$ErrorActionPreference = 'Stop'

function Read-DotEnv([string]$Path) {
  $result = @{}
  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith('#') -and $line -match '^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
      $value = $matches[2].Trim().Trim('"').Trim("'")
      $result[$matches[1]] = $value
    }
  }
  return $result
}

$vars = Read-DotEnv $EnvFile
$headers = @{ Authorization = "Bearer $($vars.CLOUDFLARE_API_TOKEN)"; 'Content-Type' = 'application/json' }
if (-not $vars.CLOUDFLARE_ZONE_ID) {
  $zone = (Invoke-RestMethod -Method Get -Uri 'https://api.cloudflare.com/client/v4/zones?name=is2u.today' -Headers $headers).result | Select-Object -First 1
  if (-not $zone) { throw 'Cloudflare zone not found' }
  $content = Get-Content -LiteralPath $EnvFile -Raw
  $content = [regex]::Replace($content, '(?m)^CLOUDFLARE_ZONE_ID\s*=.*$', "CLOUDFLARE_ZONE_ID=$($zone.id)")
  [IO.File]::WriteAllText($EnvFile, $content, [Text.UTF8Encoding]::new($false))
  $vars.CLOUDFLARE_ZONE_ID = $zone.id
}

$cors = @{
  rules = @(@{
    id = 'is2u-direct-uploads'
    allowed = @{ origins = @('https://is2u.today'); methods = @('PUT','HEAD'); headers = @('content-type') }
    exposeHeaders = @('ETag')
    maxAgeSeconds = 7200
  })
} | ConvertTo-Json -Depth 8
$base = "https://api.cloudflare.com/client/v4/accounts/$($vars.CLOUDFLARE_ACCOUNT_ID)/r2/buckets/is2u-media-prod"
Invoke-RestMethod -Method Put -Uri "$base/cors" -Headers $headers -Body $cors | Out-Null

$lifecycle = @{
  rules = @(@{
    id = 'abort-incomplete-original-uploads'
    enabled = $true
    conditions = @{ prefix = 'originals/' }
    abortMultipartUploadsTransition = @{ condition = @{ type = 'Age'; maxAge = 86400 } }
  })
} | ConvertTo-Json -Depth 8
Invoke-RestMethod -Method Put -Uri "$base/lifecycle" -Headers $headers -Body $lifecycle | Out-Null

$zoneState = Invoke-RestMethod -Method Get -Uri "https://api.cloudflare.com/client/v4/zones/$($vars.CLOUDFLARE_ZONE_ID)" -Headers $headers
Write-Output "R2_CONFIGURED=True"
Write-Output "ZONE_STATUS=$($zoneState.result.status)"
