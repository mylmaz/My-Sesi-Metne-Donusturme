param(
    [switch]$Installer
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$src = Join-Path $root "src\MySesiMetneDonusturme"
$out = Join-Path $root "build\bin"
$dist = Join-Path $root "dist"
$desktopBuild = Join-Path ([Environment]::GetFolderPath("DesktopDirectory")) "MySesiMetneDonusturme_Build"
$desktopSetup = Join-Path ([Environment]::GetFolderPath("DesktopDirectory")) "MySesiMetneDonusturme_Setup_v1.0.0.exe"
$framework = Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319"
$wpf = Join-Path $framework "WPF"
$csc = Join-Path $framework "csc.exe"

if (!(Test-Path $csc)) {
    throw ".NET Framework C# compiler bulunamadi: $csc"
}

New-Item -ItemType Directory -Force -Path $out | Out-Null
New-Item -ItemType Directory -Force -Path $dist | Out-Null

$refs = @(
    (Join-Path $framework "Microsoft.CSharp.dll"),
    (Join-Path $wpf "PresentationCore.dll"),
    (Join-Path $wpf "PresentationFramework.dll"),
    (Join-Path $framework "System.dll"),
    (Join-Path $framework "System.Core.dll"),
    (Join-Path $framework "System.Drawing.dll"),
    (Join-Path $framework "System.Runtime.Serialization.dll"),
    (Join-Path $framework "System.Web.Extensions.dll"),
    (Join-Path $framework "System.Windows.Forms.dll"),
    (Join-Path $framework "System.Xaml.dll"),
    (Join-Path $framework "System.Xml.dll"),
    (Join-Path $wpf "WindowsBase.dll")
) | ForEach-Object { "/reference:$_" }

$sources = Get-ChildItem -Path $src -Recurse -Filter *.cs | Sort-Object FullName | ForEach-Object { $_.FullName }
$exeOut = Join-Path $out "MySesiMetneDonusturme.exe"
$compileArgs = @(
    "/nologo",
    "/target:winexe",
    "/platform:anycpu",
    "/optimize+",
    "/codepage:65001",
    "/utf8output",
    "/out:$exeOut"
) + $refs + $sources

& $csc @compileArgs
if ($LASTEXITCODE -ne 0) {
    throw "Derleme basarisiz oldu. C# derleyici cikis kodu: $LASTEXITCODE"
}

$toolSource = Join-Path $root "Tools"
$toolDest = Join-Path $out "Tools"
if (Test-Path $toolSource) {
    New-Item -ItemType Directory -Force -Path $toolDest | Out-Null
    Copy-Item -Path (Join-Path $toolSource "*") -Destination $toolDest -Recurse -Force -ErrorAction SilentlyContinue
}

Copy-Item -Path (Join-Path $root "README.md") -Destination $out -Force -ErrorAction SilentlyContinue
Copy-Item -Path (Join-Path $root "LICENSE") -Destination $out -Force -ErrorAction SilentlyContinue

Add-Type -AssemblyName System.IO.Compression.FileSystem
$payloadZip = Join-Path $dist "payload.zip"
$setupExe = Join-Path $dist "MySesiMetneDonusturme_Setup_v1.0.0.exe"
if (Test-Path $payloadZip) { Remove-Item -LiteralPath $payloadZip -Force }
if (Test-Path $setupExe) { Remove-Item -LiteralPath $setupExe -Force }
[System.IO.Compression.ZipFile]::CreateFromDirectory($out, $payloadZip, [System.IO.Compression.CompressionLevel]::Optimal, $false)

$setupRefs = @(
    (Join-Path $framework "System.dll"),
    (Join-Path $framework "System.Core.dll"),
    (Join-Path $framework "System.Drawing.dll"),
    (Join-Path $framework "System.IO.Compression.dll"),
    (Join-Path $framework "System.IO.Compression.FileSystem.dll"),
    (Join-Path $framework "System.Windows.Forms.dll")
) | ForEach-Object { "/reference:$_" }

$setupSource = Join-Path $root "installer\SetupProgram.cs"
$setupManifest = Join-Path $root "installer\setup.manifest"
$setupArgs = @(
    "/nologo",
    "/target:winexe",
    "/platform:anycpu",
    "/optimize+",
    "/codepage:65001",
    "/utf8output",
    "/out:$setupExe",
    "/win32manifest:$setupManifest",
    "/resource:$payloadZip,Payload.zip"
) + $setupRefs + @($setupSource)

& $csc @setupArgs
if ($LASTEXITCODE -ne 0) {
    throw "Setup derlemesi basarisiz oldu. C# derleyici cikis kodu: $LASTEXITCODE"
}
Remove-Item -LiteralPath $payloadZip -Force

if ($Installer) {
    $isccCandidates = @(
        "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
        "C:\Program Files\Inno Setup 6\ISCC.exe"
    )
    $iscc = $isccCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (!$iscc) {
        throw "Inno Setup bulunamadi. Kurulum dosyasi icin Inno Setup 6 kurulduktan sonra: .\build.ps1 -Installer"
    }
    & $iscc (Join-Path $root "installer\MySesiMetneDonusturme.iss")
}

New-Item -ItemType Directory -Force -Path $desktopBuild | Out-Null
Copy-Item -Path (Join-Path $out "*") -Destination $desktopBuild -Recurse -Force
Copy-Item -Path (Join-Path $root "README.md") -Destination $desktopBuild -Force -ErrorAction SilentlyContinue
Copy-Item -Path (Join-Path $root "TEST_NOTES.md") -Destination $desktopBuild -Force -ErrorAction SilentlyContinue

$setup = Join-Path $root "dist\MySesiMetneDonusturme_Setup_v1.0.0.exe"
if (Test-Path $setup) {
    Copy-Item -Path $setup -Destination $desktopSetup -Force
    Copy-Item -Path $setup -Destination $desktopBuild -Force
}

Write-Host "Build tamamlandi: $out"
Write-Host "Masaustu build klasoru: $desktopBuild"
Write-Host "Setup dosyasi: $desktopSetup"
if ($Installer) {
    Write-Host "Inno Setup scripti de calistirildi."
} else {
    Write-Host "Inno Setup opsiyonel. Ayrica Inno paketi icin .\build.ps1 -Installer kullanilabilir."
}
