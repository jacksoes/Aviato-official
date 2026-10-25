param(
    [string]$FrontendHost = "127.0.0.1",
    [int]$FrontendPort = 5173,
    [string]$BackendHost = "127.0.0.1",
    [int]$BackendPort = 8000
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$frontendDir = Join-Path $root "travel-agent"
$backendDir = Join-Path $root "travel-agent-backend"
$agentDir = Join-Path $root "AI-agent"

$python = Join-Path $backendDir ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
    if (-not $pythonCommand) {
        throw "Python was not found. Install Python or create travel-agent-backend\.venv first."
    }
    $python = $pythonCommand.Source
}

$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npmCommand) {
    $npmCommand = Get-Command npm -ErrorAction SilentlyContinue
}
$bunCommand = Get-Command bun -ErrorAction SilentlyContinue
if (-not $bunCommand) {
    throw "Bun was not found. Install Bun to run the TypeScript AI agent."
}
if (-not $npmCommand) {
    throw "npm was not found. Install Node.js and npm first."
}

if (-not (Test-Path (Join-Path $frontendDir "node_modules"))) {
    throw "Frontend dependencies are missing. Run 'npm install' in travel-agent first."
}

$frontendArgs = "run dev -- --host $FrontendHost --port $FrontendPort"
$backendArgs = "-u manage.py runserver ${BackendHost}:${BackendPort}"
$processes = @()

try {
    Write-Host "Frontend: http://${FrontendHost}:${FrontendPort}"
    Write-Host "Django:   http://${BackendHost}:${BackendPort}/api/health/"
    Write-Host "AI agent: Bun process in AI-agent/ (requires its .env configuration)"
    Write-Host "Press Ctrl+C to stop the frontend, backend, and AI agent."

    $processes += Start-Process -FilePath $npmCommand.Source -ArgumentList $frontendArgs -WorkingDirectory $frontendDir -NoNewWindow -PassThru
    $processes += Start-Process -FilePath $python -ArgumentList $backendArgs -WorkingDirectory $backendDir -NoNewWindow -PassThru
    $processes += Start-Process -FilePath $bunCommand.Source -ArgumentList "start" -WorkingDirectory $agentDir -NoNewWindow -PassThru

    while (($processes | Where-Object { -not $_.HasExited }).Count -eq $processes.Count) {
        Start-Sleep -Milliseconds 500
    }
    Write-Warning "One of the servers stopped. Stopping the other server."
}
finally {
    foreach ($process in $processes) {
        if (-not $process.HasExited) {
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        }
    }
}
