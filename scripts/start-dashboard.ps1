$ErrorActionPreference = 'Stop'

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptRoot
$envFile = Join-Path $projectRoot '.env'

if (-not (Test-Path $envFile)) {
  throw "Missing .env file at $envFile"
}

Get-Content $envFile | ForEach-Object {
  if (-not $_ -or $_.Trim().StartsWith('#')) {
    return
  }

  $pair = $_ -split '=', 2
  if ($pair.Count -eq 2) {
    [System.Environment]::SetEnvironmentVariable($pair[0].Trim(), $pair[1].Trim(), 'Process')
  }
}

Set-Location $projectRoot
node server.js