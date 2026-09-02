$ErrorActionPreference = "Stop"

$Caddyfile = Join-Path $env:APPDATA "Caddy\Caddyfile"

Write-Host ""
Write-Host "========================================"
Write-Host "  UCAS Course Select - Start Server"
Write-Host "========================================"
Write-Host ""

# 1. 检查 Caddy
Write-Host "[1/4] Checking Caddy..."

if (-not (Get-Command caddy -ErrorAction SilentlyContinue)) {
    throw "Caddy is not installed or not available in PATH."
}

Write-Host "Caddy:"
caddy version

# 2. 检查配置文件
Write-Host ""
Write-Host "[2/4] Checking Caddyfile..."

if (-not (Test-Path $Caddyfile)) {
    throw "Caddyfile not found: $Caddyfile"
}

Write-Host "Caddyfile:"
Write-Host "  $Caddyfile"

# 3. 验证配置
Write-Host ""
Write-Host "[3/4] Validating configuration..."

caddy validate `
    --config $Caddyfile `
    --adapter caddyfile

if ($LASTEXITCODE -ne 0) {
    throw "Caddy configuration validation failed."
}

# 如果已经存在 Caddy，则不重复启动
$existing = Get-Process caddy -ErrorAction SilentlyContinue

if ($existing) {
    Write-Host ""
    Write-Host "Caddy is already running."
    Write-Host ""
    Write-Host "Website:"
    Write-Host "  https://ucas-course-select.site"
    exit 0
}

# 检查 80 / 443 是否被其他程序占用
$ports = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalPort -in @(80, 443) }

if ($ports) {
    Write-Host ""
    Write-Host "[ERROR] Port 80 or 443 is already in use:"
    $ports | Format-Table LocalAddress, LocalPort, OwningProcess

    throw "Cannot start Caddy because port 80 or 443 is occupied."
}

# 4. 启动
Write-Host ""
Write-Host "[4/4] Starting Caddy..."
Write-Host ""
Write-Host "Website:"
Write-Host "  https://ucas-course-select.site"
Write-Host ""
Write-Host "Press Ctrl+C to stop the server."
Write-Host ""
Write-Host "========================================"
Write-Host ""

caddy run `
    --config $Caddyfile `
    --adapter caddyfile