param(
    [string]$ExePath = "dist-electron-package\win-unpacked\MySesiMetneDonusturme.exe",
    [string]$IconPath = "resources\app-icon.ico"
)

$ErrorActionPreference = "Stop"

$exe = Resolve-Path -LiteralPath $ExePath
$icon = Resolve-Path -LiteralPath $IconPath
$cacheRoot = Join-Path $env:LOCALAPPDATA "electron-builder\Cache\winCodeSign"

$rcedit = $null
if (Test-Path -LiteralPath $cacheRoot) {
    $rcedit = Get-ChildItem -LiteralPath $cacheRoot -Recurse -Filter "rcedit-x64.exe" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
}

if (-not $rcedit) {
    Write-Warning "rcedit-x64.exe bulunamadı. Exe ikonu atlandı; installer kısayolu uygulama ikonunu kullanmaya devam eder."
    exit 0
}

& $rcedit.FullName $exe.Path `
    --set-icon $icon.Path `
    --set-version-string "CompanyName" "Mustafa Yilmaz" `
    --set-version-string "FileDescription" "My Sesi Metne Donusturme" `
    --set-version-string "ProductName" "My Sesi Metne Donusturme" `
    --set-version-string "LegalCopyright" "Copyright (C) 2026 Mustafa Yilmaz" `
    --set-file-version "1.0.0" `
    --set-product-version "1.0.0"

if ($LASTEXITCODE -ne 0) {
    throw "Exe ikonu güncellenemedi. rcedit çıkış kodu: $LASTEXITCODE"
}

Write-Output "Exe ikonu güncellendi: $($exe.Path)"
