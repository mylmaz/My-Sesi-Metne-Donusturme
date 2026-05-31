param(
    [switch]$IncludeVeryHighModel
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$tools = Join-Path $root "Tools"
$downloads = Join-Path $root "build\downloads"

New-Item -ItemType Directory -Force -Path $downloads | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $tools "yt-dlp") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $tools "ffmpeg") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $tools "whisper") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $tools "models") | Out-Null

function Download-IfMissing {
    param(
        [string]$Url,
        [string]$Destination
    )

    if (Test-Path $Destination) {
        Write-Host "Hazir: $Destination"
        return
    }

    $tmp = "$Destination.download"
    if (Test-Path $tmp) { Remove-Item -LiteralPath $tmp -Force }
    Write-Host "Indiriliyor: $Url"
    Invoke-WebRequest -Uri $Url -OutFile $tmp -UseBasicParsing -Headers @{ "User-Agent" = "MySesiMetneDonusturme/1.0.0" }
    Move-Item -LiteralPath $tmp -Destination $Destination -Force
}

Download-IfMissing "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe" (Join-Path $tools "yt-dlp\yt-dlp.exe")

$ffmpegZip = Join-Path $downloads "ffmpeg.zip"
if (!(Test-Path (Join-Path $tools "ffmpeg\ffmpeg.exe")) -or !(Test-Path (Join-Path $tools "ffmpeg\ffprobe.exe"))) {
    Download-IfMissing "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip" $ffmpegZip
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::OpenRead($ffmpegZip)
    try {
        foreach ($entry in $zip.Entries) {
            if ($entry.Name -eq "ffmpeg.exe" -or $entry.Name -eq "ffprobe.exe") {
                $dest = Join-Path (Join-Path $tools "ffmpeg") $entry.Name
                if (Test-Path $dest) { Remove-Item -LiteralPath $dest -Force }
                [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $dest)
                Write-Host "Cikarildi: $dest"
            }
        }
    }
    finally {
        $zip.Dispose()
    }
}

$whisperZip = Join-Path $downloads "whisper.zip"
if (!(Test-Path (Join-Path $tools "whisper\whisper-cli.exe")) -and !(Test-Path (Join-Path $tools "whisper\main.exe"))) {
    Download-IfMissing "https://github.com/ggml-org/whisper.cpp/releases/latest/download/whisper-bin-x64.zip" $whisperZip
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::OpenRead($whisperZip)
    try {
        foreach ($entry in $zip.Entries) {
            if ($entry.Name.EndsWith(".exe", [System.StringComparison]::OrdinalIgnoreCase) -or $entry.Name.EndsWith(".dll", [System.StringComparison]::OrdinalIgnoreCase)) {
                $dest = Join-Path (Join-Path $tools "whisper") $entry.Name
                if (Test-Path $dest) { Remove-Item -LiteralPath $dest -Force }
                [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $dest)
            }
        }
    }
    finally {
        $zip.Dispose()
    }
}

Download-IfMissing "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin" (Join-Path $tools "models\ggml-small.bin")

if ($IncludeVeryHighModel) {
    Download-IfMissing "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin" (Join-Path $tools "models\ggml-medium.bin")
}

Write-Host "Araçlar hazır: $tools"
