param([switch]$IncludeDependencySources)

# Preserve the fixed FFmpeg source tree and the complete upstream build recipes.
# Dependency retrieval is upstream's own Docker-based downloader; do not replace
# pinned revisions with the current HEAD of a dependency repository.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$destination = Join-Path $root 'build\third-party-sources'
$manifest = Get-Content -LiteralPath (Join-Path $root 'Tools\ffmpeg-sources.json') -Raw -Encoding UTF8 | ConvertFrom-Json
New-Item -ItemType Directory -Force -Path $destination | Out-Null
foreach ($source in $manifest.archives) {
    $file = Join-Path $destination $source.file
    if (!(Test-Path -LiteralPath $file) -or (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $source.sha256) {
        & curl.exe --location --fail --retry 3 --silent --show-error --output "$file.download" $source.url
        if ($LASTEXITCODE -ne 0) { throw "Kaynak indirilemedi: $($source.url)" }
        if ((Get-FileHash -LiteralPath "$file.download" -Algorithm SHA256).Hash -ne $source.sha256) { throw "Kaynak SHA256 hatasi: $($source.file)" }
        Move-Item -LiteralPath "$file.download" -Destination $file -Force
    }
    Write-Host "Kaynak dogrulandi: $($source.file)"
    & tar.exe -xf $file -C $destination
    if ($LASTEXITCODE -ne 0) { throw "Kaynak arsivi acilamadi: $($source.file)" }
}
$recipeRoot = Join-Path $destination 'FFmpeg-Builds-63ac3265b0789ea16c7b1f8351cd2ad195a28722'
$dependencyRecords = foreach ($file in Get-ChildItem -LiteralPath (Join-Path $recipeRoot 'scripts.d') -Recurse -File -Filter '*.sh') {
    $text = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8
    $variables = [ordered]@{}
    foreach ($match in [regex]::Matches($text, '(?m)^(SCRIPT_[A-Z0-9_]+)=(.+)$')) {
        $variables[$match.Groups[1].Value] = $match.Groups[2].Value.Trim()
    }
    if ($variables.Count) {
        [ordered]@{ recipe=$file.FullName.Substring($recipeRoot.Length+1).Replace('\','/'); sourceVariables=$variables }
    }
}
$record = [ordered]@{
    binaryVersion=$manifest.binaryVersion
    ffmpegCommit=$manifest.ffmpegCommit
    recipesCommit=$manifest.recipesCommit
    sourceFiles=@($dependencyRecords)
    dependencyFetch='Run ./download.sh from the fixed FFmpeg-Builds tree on a Docker-enabled host; sources are archived in .cache/downloads.'
    status='FFmpeg source and fixed build recipes verified. Full dependency source archives require the upstream Docker downloader and are not claimed complete by this manifest.'
}
[IO.File]::WriteAllText((Join-Path $destination 'dependency-source-manifest.json'), ($record | ConvertTo-Json -Depth 8), (New-Object Text.UTF8Encoding($false)))
Copy-Item -LiteralPath (Join-Path $root 'Tools\ffmpeg-sources.json') -Destination $destination -Force
Copy-Item -LiteralPath (Join-Path $root 'Tools\THIRD_PARTY_NOTICES.md') -Destination $destination -Force
if ($IncludeDependencySources) {
    if (!(Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Tam bagimlilik kaynaklari icin Docker ve upstream download.sh calistirilabilen bir Linux kabugu gerekir.' }
    if (!(Get-Command bash -ErrorAction SilentlyContinue)) { throw 'Upstream download.sh icin bash bulunamadi.' }
    Push-Location $recipeRoot
    try {
        & bash ./download.sh
        if ($LASTEXITCODE -ne 0) { throw 'Upstream bagimlilik kaynak indirmesi tamamlanamadi.' }
    } finally { Pop-Location }
}
Write-Host "Kaynaklar: $destination"
