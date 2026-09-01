$ErrorActionPreference = "Stop"

$ProjectRoot = $PSScriptRoot
$SiteRoot = Join-Path ([Environment]::GetFolderPath("Desktop")) "vite-site-prod"
$BackupRoot = Join-Path ([Environment]::GetFolderPath("Desktop")) "vite-site-prod-backup"

Write-Host ""
Write-Host "========================================"
Write-Host "  UCAS Course Select - Deploy"
Write-Host "========================================"
Write-Host ""

Push-Location $ProjectRoot

try {
    # 1. 构建
    Write-Host "[1/5] Building..."

    pnpm run build

    if ($LASTEXITCODE -ne 0) {
        throw "pnpm run build failed."
    }

    # 2. 检查构建结果
    Write-Host "[2/5] Checking dist..."

    if (-not (Test-Path "$ProjectRoot\dist\index.html")) {
        throw "dist\index.html does not exist."
    }

    # 3. 备份当前线上版本
    Write-Host "[3/5] Backing up current production..."

    if (Test-Path $SiteRoot) {
        New-Item -ItemType Directory -Force $BackupRoot | Out-Null

        robocopy $SiteRoot $BackupRoot /MIR /R:2 /W:1 /NFL /NDL /NJH /NJS /NP

        if ($LASTEXITCODE -ge 8) {
            throw "Backup failed. Robocopy exit code: $LASTEXITCODE"
        }
    }

    # 4. 部署新版本
    Write-Host "[4/5] Deploying new version..."

    New-Item -ItemType Directory -Force $SiteRoot | Out-Null

    robocopy "$ProjectRoot\dist" $SiteRoot /MIR /R:2 /W:1 /NFL /NDL /NJH /NJS /NP

    if ($LASTEXITCODE -ge 8) {
        Write-Host "Deployment failed. Restoring backup..."

        if (Test-Path "$BackupRoot\index.html") {
            robocopy $BackupRoot $SiteRoot /MIR /R:2 /W:1
        }

        throw "Deployment failed. Robocopy exit code: $LASTEXITCODE"
    }

    # 5. 最后检查
    Write-Host "[5/5] Verifying..."

    if (-not (Test-Path "$SiteRoot\index.html")) {
        throw "Production index.html is missing."
    }

    Write-Host ""
    Write-Host "========================================"
    Write-Host "  Deployment completed successfully"
    Write-Host "========================================"
    Write-Host ""
    Write-Host "Production:"
    Write-Host "  $SiteRoot"
    Write-Host ""
    Write-Host "Website:"
    Write-Host "  https://ucas-course-select.site"
    Write-Host ""
}
finally {
    Pop-Location
}