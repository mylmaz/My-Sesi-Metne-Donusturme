param()

# Developer/build preparation only. The installed app never downloads tools/models.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$toolsRoot = Join-Path $root 'Tools'
$downloads = Join-Path $root 'build\downloads'
$lock = Get-Content -LiteralPath (Join-Path $toolsRoot 'tools-lock.json') -Raw -Encoding UTF8 | ConvertFrom-Json
New-Item -ItemType Directory -Force -Path $downloads | Out-Null

function Get-VerifiedDownload($Asset) {
    $destination = Join-Path $root $Asset.destination
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
    if (Test-Path -LiteralPath $destination) {
        if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash -eq $Asset.sha256) {
            Write-Host "Dogrulandi: $($Asset.destination)"
            return $destination
        }
        Write-Host "Butunluk hatasi, yeniden indiriliyor: $($Asset.destination)"
    }
    $temporary = "$destination.download"
    Write-Host "Indiriliyor: $($Asset.url)"
    & curl.exe --location --fail --retry 3 --connect-timeout 30 --silent --show-error --output $temporary $Asset.url
    if ($LASTEXITCODE -ne 0) { throw "Indirme basarisiz: $($Asset.url)" }
    if ((Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash -ne $Asset.sha256) {
        throw "SHA256 uyusmuyor: $($Asset.destination). Paket olusturulmadi."
    }
    Move-Item -LiteralPath $temporary -Destination $destination -Force
    return $destination
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
function Extract-SelectedZip($Archive, $Destination, $Pattern) {
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    $zip = [IO.Compression.ZipFile]::OpenRead($Archive)
    try {
        foreach ($entry in $zip.Entries) {
            if ($entry.FullName -match $Pattern -and $entry.Name) {
                [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, (Join-Path $Destination $entry.Name), $true)
            }
        }
    } finally { $zip.Dispose() }
}

$assets = @{}
foreach ($asset in $lock.assets) { $assets[$asset.id] = Get-VerifiedDownload $asset }
Extract-SelectedZip $assets.ffmpeg (Join-Path $toolsRoot 'ffmpeg') '/bin/(ffmpeg\.exe|ffprobe\.exe|[^/]+\.dll)$'
Extract-SelectedZip $assets.whisper (Join-Path $toolsRoot 'whisper') '/(whisper-cli\.exe|whisper\.dll|ggml[^/]*\.dll)$'
Extract-SelectedZip $assets.deno (Join-Path $toolsRoot 'deno') '(^|/)deno\.exe$'
Extract-SelectedZip $assets.ffmpeg (Join-Path $toolsRoot 'licenses\ffmpeg') '(^|/)LICENSE\.txt$'

# Extract Microsoft's signed redistributable's embedded cabinets, without installing
# software or requiring administrator rights. App-local MSVC DLLs are included with
# whisper-cli.exe; Windows 10/11 already supply the Universal C Runtime.
$signature = Get-AuthenticodeSignature -LiteralPath $assets.vcredist
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation') {
    throw 'Microsoft VC Redistributable imzasi dogrulanamadi.'
}
$vcWork = Join-Path $downloads 'vc-runtime-prepared'
New-Item -ItemType Directory -Force -Path $vcWork | Out-Null
$bytes = [IO.File]::ReadAllBytes($assets.vcredist)
$offset = -1
$cabinets = @()
while (($offset = [Array]::IndexOf($bytes, [byte]77, $offset + 1)) -ge 0) {
    if ($offset + 12 -lt $bytes.Length -and $bytes[$offset+1] -eq 83 -and $bytes[$offset+2] -eq 67 -and $bytes[$offset+3] -eq 70) {
        $size = [BitConverter]::ToUInt32($bytes, $offset + 8)
        if ($size -gt 36 -and ([long]$offset + $size) -le $bytes.Length) {
            $cab = Join-Path $vcWork "embedded-$offset.cab"
            $stream = [IO.File]::OpenWrite($cab)
            try { $stream.SetLength(0); $stream.Write($bytes, $offset, $size) } finally { $stream.Dispose() }
            $cabinets += $cab
        }
    }
}
if ($cabinets.Count -ne 2) { throw 'Microsoft VC Redistributable kabin yapisi beklenenden farkli.' }
$ux = Join-Path $vcWork 'ux'
$payload = Join-Path $vcWork 'payload'
$runtime = Join-Path $vcWork 'runtime'
New-Item -ItemType Directory -Force -Path $ux,$payload,$runtime | Out-Null
foreach ($pair in @(@($cabinets[0],$ux),@($cabinets[1],$payload))) {
    & "$env:WINDIR\System32\expand.exe" $pair[0] '-F:*' $pair[1] | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'VC kabin dosyasi acilamadi.' }
}
[xml]$manifest = Get-Content -LiteralPath (Join-Path $ux '0') -Raw -Encoding UTF8
$runtimeCab = @($manifest.BurnManifest.Payload | Where-Object { $_.FilePath -eq 'packages\vcRuntimeMinimum_amd64\cab1.cab' })
if ($runtimeCab.Count -ne 1) { throw 'x64 VC runtime kabin dosyasi bulunamadi.' }
& "$env:WINDIR\System32\expand.exe" (Join-Path $payload $runtimeCab[0].SourcePath) '-F:*' $runtime | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'VC runtime dosyalari acilamadi.' }
foreach ($file in Get-ChildItem -LiteralPath $runtime -File -Filter '*.dll_amd64') {
    Copy-Item -LiteralPath $file.FullName -Destination (Join-Path (Join-Path $toolsRoot 'whisper') ($file.Name -replace '_amd64$','')) -Force
}
$license = @($manifest.BurnManifest.UX.Payload | Where-Object { $_.FilePath -eq 'license.rtf' })
Copy-Item -LiteralPath (Join-Path $ux $license[0].SourcePath) -Destination (Join-Path $toolsRoot 'licenses\Microsoft-VC-Runtime-LICENSE.rtf') -Force

$fileRecords = @()
foreach ($folder in @('ffmpeg','whisper','yt-dlp','deno','models','licenses')) {
    foreach ($file in Get-ChildItem -LiteralPath (Join-Path $toolsRoot $folder) -Recurse -File | Sort-Object FullName) {
        $relative = $file.FullName.Substring($toolsRoot.Length + 1).Replace('\','/')
        $fileRecords += [ordered]@{ path=$relative; size=$file.Length; sha256=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
    }
}
$toolManifest = [ordered]@{ schemaVersion=1; model='ggml-large-v2-q5_0.bin'; files=$fileRecords }
$json = $toolManifest | ConvertTo-Json -Depth 6
[IO.File]::WriteAllText((Join-Path $toolsRoot 'runtime-manifest.json'), $json, (New-Object Text.UTF8Encoding($false)))
Write-Host 'Araclar ve Large-v2 q5_0 modeli hazir. npm run tools:validate ile dogrulayin.'
