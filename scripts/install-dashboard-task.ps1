$ErrorActionPreference = 'Stop'

param(
  [string]$TaskName = 'MUVS-Dashboard',
  [int]$Port = 3036
)

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptRoot
$startScript = Join-Path $scriptRoot 'start-dashboard.ps1'

if (-not (Test-Path $startScript)) {
  throw "Start script not found: $startScript"
}

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
  throw 'Node.js is not installed or not available in PATH.'
}

$taskAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$startScript`""
$taskTrigger = New-ScheduledTaskTrigger -AtStartup
$taskSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

Register-ScheduledTask -TaskName $TaskName -Action $taskAction -Trigger $taskTrigger -Settings $taskSettings -Description 'Starts the Chengdu 6F MUVS dashboard on system startup.' | Out-Null

$firewallRule = Get-NetFirewallRule -DisplayName "MUVS Dashboard Port $Port" -ErrorAction SilentlyContinue
if (-not $firewallRule) {
  New-NetFirewallRule -DisplayName "MUVS Dashboard Port $Port" -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port | Out-Null
}

Write-Output "Scheduled task '$TaskName' created."
Write-Output "Firewall rule for TCP $Port is ensured."
Write-Output "Project root: $projectRoot"