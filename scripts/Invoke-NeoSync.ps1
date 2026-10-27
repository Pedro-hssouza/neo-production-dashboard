$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot ".env"
if (-not (Test-Path $envPath)) {
  throw "Arquivo .env nao encontrado em $projectRoot"
}

$settings = @{}
foreach ($line in Get-Content $envPath) {
  if ($line -match '^\s*(SYNC_SECRET|NEO_DASHBOARD_URL)\s*=\s*(.*?)\s*$') {
    $value = $Matches[2].Trim()
    if ($value.Length -ge 2 -and $value[0] -eq '"' -and $value[-1] -eq '"') {
      $value = $value.Substring(1, $value.Length - 2)
    } elseif ($value.Length -ge 2 -and $value[0] -eq "'" -and $value[-1] -eq "'") {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $settings[$Matches[1]] = $value
  }
}

$secret = $settings["SYNC_SECRET"]
if ([string]::IsNullOrWhiteSpace($secret)) {
  throw "SYNC_SECRET nao esta configurado no .env"
}

$baseUrl = $settings["NEO_DASHBOARD_URL"]
if ([string]::IsNullOrWhiteSpace($baseUrl)) {
  $baseUrl = "http://localhost:3000"
}
$uri = "{0}/api/sync/neo" -f $baseUrl.TrimEnd("/")

$logDirectory = Join-Path $env:LOCALAPPDATA "NeoDashboard"
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$logPath = Join-Path $logDirectory "neo-sync.log"
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss zzz"

try {
  $result = Invoke-RestMethod -Method Post -Uri $uri -Headers @{ Authorization = "Bearer $secret" } -TimeoutSec 130
  $sync = $result.sincronizacao
  Add-Content -Path $logPath -Value "$timestamp sucesso: recebidos=$($sync.recebidos), gravados=$($sync.gravados)"
} catch {
  Add-Content -Path $logPath -Value "$timestamp erro: $($_.Exception.Message)"
  exit 1
}