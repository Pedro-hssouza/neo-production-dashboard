$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $PSScriptRoot "Invoke-NeoSync.ps1"
if (-not (Test-Path $scriptPath)) {
  throw "Script de sincronização não encontrado: $scriptPath"
}

$taskName = "NEO Dashboard - Sync"
$action = New-ScheduledTaskAction `
  -Execute (Join-Path $PSHOME "powershell.exe") `
  -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$scriptPath`""
$trigger = New-ScheduledTaskTrigger `
  -Once `
  -At (Get-Date).AddMinutes(1) `
  -RepetitionInterval (New-TimeSpan -Minutes 30) `
  -RepetitionDuration (New-TimeSpan -Days 3650)
$principal = New-ScheduledTaskPrincipal `
  -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) `
  -LogonType Interactive `
  -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Settings $settings `
  -Description "Synchronizes NEO data every 30 minutes." `
  -Force | Out-Null

Write-Output "Task '$taskName' registered. It runs while this account is signed in."