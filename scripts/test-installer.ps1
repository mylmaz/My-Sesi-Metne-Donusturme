param(
  [string]$MediaPath,
  [string]$OriginalInstallPath = (Join-Path $env:ProgramFiles 'MySesiMetneDonusturme'),
  [string]$ReuseVerifiedBuildReport,
  [switch]$SkipInstalledSourceSmoke
)

# A separate installer identity is essential: a production NSIS upgrade would
# uninstall the user's existing application before installing the test build.
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runId = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 8)
$evidenceRoot = Join-Path $repoRoot ('build/installer-smoke-tests/' + $runId)
$packageRoot = Join-Path $repoRoot 'build/installer-smoke-package'
$installParent = [IO.Path]::GetFullPath((Join-Path ([IO.Path]::GetTempPath()) ('MyTranscriptInstallerSmoke-' + $runId)))
$installRoot = Join-Path $installParent 'app'
$testGuid = 'b7c9d7b4-48e8-5dde-b722-a753bfb058c1'
$productionGuid = '942f0831-6fd9-527e-8d53-7013fdd3abc2'
$testName = 'My Transcript Installer Smoke Test'
$testExeName = 'MyTranscriptInstallerSmokeTest.exe'
$utf8 = New-Object Text.UTF8Encoding($false)
New-Item -ItemType Directory -Force -Path $evidenceRoot | Out-Null
$reportPath = Join-Path $evidenceRoot 'result.json'
$report = [ordered]@{
  startedAt = [DateTime]::UtcNow.ToString('o'); status = 'running'; testGuid = $testGuid
  installRoot = $installRoot; evidenceRoot = $evidenceRoot; cleanWindowsVmTested = $false
  limitations = @(
    'This is an isolated identity on the existing Windows host, not a clean Windows VM.',
    'The test installer excludes the production shortcut cleanup include to protect existing user shortcuts.',
    'The installed executable transcribes and exports directly; additional wider tests load its app.asar using the same Electron version from node_modules.',
    'Offline local tests block HTTP/HTTPS inside Electron; the host network is not disconnected.'
  )
  checks = [ordered]@{}
}
$installed = $false
$pendingError = $null
$originalEnvironment = @{}

function Save-Report {
  [IO.File]::WriteAllText($reportPath, ($report | ConvertTo-Json -Depth 20), $utf8)
}

function Assert-TestInstallPath([string]$Candidate) {
  $absolute = [IO.Path]::GetFullPath($Candidate)
  $expected = [IO.Path]::GetFullPath($installRoot)
  if ($absolute -ne $expected -or !$absolute.StartsWith($installParent + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Unsafe test install path: $absolute"
  }
  # Use case-sensitive matching: Turkish culture case folding can otherwise
  # classify an ASCII capital I as outside the ASCII range.
  if ($absolute -cmatch '[^\x20-\x7e]' -or $absolute -match '\s') {
    throw 'The isolated NSIS /D test directory must be an absolute ASCII path without spaces.'
  }
  if ($absolute -eq [IO.Path]::GetFullPath($OriginalInstallPath)) { throw 'Test path matches the original installation.' }
  return $absolute
}

function ConvertTo-NativeArgument([string]$Value) {
  if ($Value -notmatch '[\s"]' -and $Value.Length -gt 0) { return $Value }
  $escaped = [regex]::Replace($Value, '(\\*)"', { param($match) ('\' * (2 * $match.Groups[1].Length + 1)) + '"' })
  $escaped = [regex]::Replace($escaped, '\\+$', { param($match) '\' * (2 * $match.Length) })
  return '"' + $escaped + '"'
}

function Start-TestProcess([string]$Executable, [string[]]$Arguments, [string]$LogName, [int]$TimeoutSeconds = 1800, [switch]$Background) {
  $start = New-Object Diagnostics.ProcessStartInfo
  $start.FileName = $Executable
  $start.Arguments = (($Arguments | ForEach-Object { ConvertTo-NativeArgument $_ }) -join ' ')
  $start.WorkingDirectory = $repoRoot
  $start.UseShellExecute = $false
  $start.CreateNoWindow = $true
  $start.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  $process = New-Object Diagnostics.Process
  $process.StartInfo = $start
  if (!$process.Start()) { throw "Could not start $Executable" }
  $stdout = $process.StandardOutput.ReadToEndAsync()
  $stderr = $process.StandardError.ReadToEndAsync()
  if ($Background) { return @{ Process = $process; Stdout = $stdout; Stderr = $stderr; LogName = $LogName } }
  $timedOut = !$process.WaitForExit($TimeoutSeconds * 1000)
  if ($timedOut) {
    & "$env:SystemRoot/System32/taskkill.exe" /PID $process.Id /T /F | Out-Null
  }
  $process.WaitForExit()
  [IO.File]::WriteAllText((Join-Path $evidenceRoot ($LogName + '.stdout.log')), $stdout.GetAwaiter().GetResult(), $utf8)
  [IO.File]::WriteAllText((Join-Path $evidenceRoot ($LogName + '.stderr.log')), $stderr.GetAwaiter().GetResult(), $utf8)
  if ($timedOut) { throw "Test process timed out: $LogName; see $evidenceRoot" }
  if ($process.ExitCode -ne 0) { throw "$LogName failed with exit code $($process.ExitCode); see $evidenceRoot" }
}

function Get-RegistrySnapshot([string]$Guid) {
  $values = [ordered]@{}
  foreach ($hive in @('HKEY_CURRENT_USER', 'HKEY_LOCAL_MACHINE')) {
    foreach ($prefix in @('Software', 'Software\WOW6432Node')) {
      foreach ($suffix in @($Guid, "Microsoft\Windows\CurrentVersion\Uninstall\$Guid")) {
        $key = "Registry::$hive\$prefix\$suffix"
        if (Test-Path -LiteralPath $key) {
          $properties = Get-ItemProperty -LiteralPath $key
          $data = [ordered]@{}
          foreach ($property in ($properties.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | Sort-Object Name)) {
            $data[$property.Name] = $property.Value
          }
          $values[$key] = $data
        }
      }
    }
  }
  return $values
}

function Get-ProtectedState {
  $files = [ordered]@{}
  $paths = New-Object 'Collections.Generic.List[string]'
  foreach ($relative in @('MySesiMetneDonusturme.exe', 'resources/app.asar')) { $paths.Add((Join-Path $OriginalInstallPath $relative)) }
  foreach ($folder in @(
    [Environment]::GetFolderPath('DesktopDirectory'), [Environment]::GetFolderPath('CommonDesktopDirectory'),
    [Environment]::GetFolderPath('Programs'), [Environment]::GetFolderPath('CommonPrograms')
  ) | Select-Object -Unique) {
    if ($folder -and (Test-Path -LiteralPath $folder)) {
      Get-ChildItem -LiteralPath $folder -Filter '*.lnk' -File -Recurse -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like 'My Sesi Metne*' -or $_.Name -like 'Kaldır My Sesi Metne*' } |
        ForEach-Object { $paths.Add($_.FullName) }
    }
  }
  foreach ($name in @('my-sesi-metne-donusturme', 'MySesiMetneDonusturme', 'My Sesi Metne Donusturme', 'My Sesi Metne Dönüştürme')) {
    foreach ($file in @('settings.json', 'history.json', 'data/settings.json', 'data/history.json')) { $paths.Add((Join-Path (Join-Path $env:APPDATA $name) $file)) }
  }
  foreach ($file in ($paths | Sort-Object -Unique)) {
    $files[$file] = if (Test-Path -LiteralPath $file -PathType Leaf) { (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash } else { $null }
  }
  return [ordered]@{ files = $files; registry = (Get-RegistrySnapshot $productionGuid) }
}

function Get-TestShortcutPaths {
  return @(
    (Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) ($testName + '.lnk')),
    (Join-Path ([Environment]::GetFolderPath('Programs')) ($testName + '/' + $testName + '.lnk'))
  )
}

function Uninstall-TestApplication {
  $safeRoot = Assert-TestInstallPath $installRoot
  $uninstallers = @(Get-ChildItem -LiteralPath $safeRoot -Filter 'Uninstall *.exe' -File -ErrorAction SilentlyContinue)
  if ($uninstallers.Count -ne 1) { throw 'Exactly one test uninstaller was expected.' }
  Start-TestProcess $uninstallers[0].FullName @('/S', '--current-user', ('_?=' + $safeRoot)) 'uninstall' 300
  if ((Test-Path -LiteralPath (Join-Path $safeRoot $testExeName)) -or (Test-Path -LiteralPath (Join-Path $safeRoot 'resources'))) {
    throw 'NSIS did not remove the isolated application files.'
  }
  foreach ($shortcut in (Get-TestShortcutPaths)) { if (Test-Path -LiteralPath $shortcut) { throw "Test shortcut remains: $shortcut" } }
  if ((Get-RegistrySnapshot $testGuid).Count -ne 0) { throw 'The test uninstall registry entry remains.' }
  # _?= executes the uninstaller in place, so its own executable can remain.
  # The absolute target was checked above against this run's generated temp root.
  if (Test-Path -LiteralPath $safeRoot) { Remove-Item -LiteralPath $safeRoot -Recurse -Force }
  if (Test-Path -LiteralPath $installParent) { Remove-Item -LiteralPath $installParent -Force }
  $report.checks.uninstall = 'passed'
}

try {
  Assert-TestInstallPath $installRoot | Out-Null
  if ((Get-RegistrySnapshot $testGuid).Count -ne 0) { throw 'An earlier smoke installation is registered; refusing to upgrade or uninstall it.' }
  foreach ($shortcut in (Get-TestShortcutPaths)) { if (Test-Path -LiteralPath $shortcut) { throw "An existing test shortcut must be inspected first: $shortcut" } }
  if (!$MediaPath) { $MediaPath = Join-Path $repoRoot 'build/real-media-tests/input/tr_tr.wav' }
  $MediaPath = [IO.Path]::GetFullPath($MediaPath)
  if (!(Test-Path -LiteralPath $MediaPath -PathType Leaf)) { throw "A real speech sample is required: $MediaPath" }
  $node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
  if (!$node) {
    $node = Get-ChildItem -LiteralPath (Join-Path $repoRoot 'build/dev-tools') -Directory -Filter 'node-*-win-x64' |
      Sort-Object Name -Descending | ForEach-Object { Join-Path $_.FullName 'node.exe' } | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  }
  if (!$node) { throw 'Node.js must be installed or prepared under build/dev-tools.' }
  $protectedBefore = Get-ProtectedState
  $report.protectedBefore = $protectedBefore
  Save-Report
  foreach ($name in @('MY_TRANSCRIPT_SKIP_DESKTOP_COPY', 'ELECTRON_SMOKE', 'ELECTRON_APP_ROOT', 'ELECTRON_APP_RESOURCES', 'ELECTRON_TEST_MEDIA', 'ELECTRON_TEST_YOUTUBE', 'ELECTRON_TEST_MULTILINGUAL', 'ELECTRON_RUN_AS_NODE', 'VITE_DEV_SERVER_URL')) {
    $originalEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
  }
  $env:MY_TRANSCRIPT_SKIP_DESKTOP_COPY = '1'
  $env:ELECTRON_SMOKE = '1'
  Remove-Item Env:ELECTRON_TEST_YOUTUBE -ErrorAction SilentlyContinue
  Remove-Item Env:ELECTRON_TEST_MULTILINGUAL -ErrorAction SilentlyContinue
  Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
  Remove-Item Env:VITE_DEV_SERVER_URL -ErrorAction SilentlyContinue

  $config = (Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $repoRoot 'package.json') | ConvertFrom-Json).build
  $config.appId = 'com.mustafayilmaz.mysesimetnedonusturme.installersmoke'
  $config.productName = $testName
  $config.artifactName = 'My-Transcript-Installer-Smoke-x64.${ext}'
  $config.directories.output = $packageRoot
  $config.win.executableName = [IO.Path]::GetFileNameWithoutExtension($testExeName)
  $config.nsis | Add-Member -Force -NotePropertyName guid -NotePropertyValue $testGuid
  $config.nsis | Add-Member -Force -NotePropertyName menuCategory -NotePropertyValue $testName
  $config.nsis | Add-Member -Force -NotePropertyName runAfterFinish -NotePropertyValue $false
  $config.nsis.deleteAppDataOnUninstall = $false
  $config.nsis.shortcutName = $testName
  $config.nsis.uninstallDisplayName = $testName
  $config | Add-Member -Force -NotePropertyName extraMetadata -NotePropertyValue @{
    name = 'my-transcript-installer-smoke-test'; productName = $testName
  }
  $safeInclude = Join-Path $evidenceRoot 'isolated-installer.nsh'
  [IO.File]::WriteAllText($safeInclude, '; Test identity: standard NSIS shortcuts only; production shortcut cleanup is intentionally excluded.', $utf8)
  $config.nsis.include = $safeInclude
  $configPath = Join-Path $evidenceRoot 'electron-builder.json'
  [IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json -Depth 20), $utf8)
  $installer = Join-Path $packageRoot 'My-Transcript-Installer-Smoke-x64.exe'
  if ($ReuseVerifiedBuildReport) {
    $ReuseVerifiedBuildReport = [IO.Path]::GetFullPath($ReuseVerifiedBuildReport)
    $priorReport = Get-Content -Raw -Encoding UTF8 -LiteralPath $ReuseVerifiedBuildReport | ConvertFrom-Json
    if ($priorReport.checks.isolatedBuild -ne 'passed' -or $priorReport.testGuid -ne $testGuid -or
        [IO.Path]::GetFullPath($priorReport.installer) -ne [IO.Path]::GetFullPath($installer) -or
        $priorReport.checks.originalApplicationUnchanged -ne 'passed') {
      throw 'Only a verified fixture build with this exact identity and unchanged original application may be reused.'
    }
    if ((Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash -ne $priorReport.installerSha256) {
      throw 'The existing fixture installer differs from the passed report SHA256.'
    }
    if ($SkipInstalledSourceSmoke -and $priorReport.checks.installedSourceOfflineSmoke -ne 'passed') {
      throw 'Skipping the wider source smoke requires its successful evidence in the reused report.'
    }
    $report.reusedFixtureFrom = $ReuseVerifiedBuildReport
  } else {
    if ($SkipInstalledSourceSmoke) { throw 'The wider smoke can only be reused with a passed fixture report.' }
    Start-TestProcess $node @((Join-Path $repoRoot 'node_modules/electron-builder/out/cli/cli.js'), '--win', 'nsis', '--x64', '--publish', 'never', '--config', $configPath) 'build' 3600
  }
  if (!(Test-Path -LiteralPath $installer -PathType Leaf)) { throw "Isolated test installer was not built: $installer" }
  $report.installer = $installer
  $report.installerSha256 = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash
  $report.checks.isolatedBuild = 'passed'
  Save-Report

  New-Item -ItemType Directory -Path $installParent | Out-Null
  Start-TestProcess $installer @('--current-user', '/S', ('/D=' + (Assert-TestInstallPath $installRoot))) 'install' 600
  $installed = $true
  $installedExe = Join-Path $installRoot $testExeName
  $resources = Join-Path $installRoot 'resources'
  $asar = Join-Path $resources 'app.asar'
  if (!(Test-Path -LiteralPath $installedExe) -or !(Test-Path -LiteralPath $asar)) { throw 'Installed executable or app.asar is missing.' }
  $report.checks.install = 'passed'
  $shell = New-Object -ComObject WScript.Shell
  foreach ($shortcut in (Get-TestShortcutPaths)) {
    if (!(Test-Path -LiteralPath $shortcut)) { throw "Test shortcut missing: $shortcut" }
    $link = $shell.CreateShortcut($shortcut)
    if ([IO.Path]::GetFullPath($link.TargetPath) -ne [IO.Path]::GetFullPath($installedExe)) { throw "Test shortcut target is wrong: $shortcut" }
  }
  $report.checks.desktopAndStartMenuShortcuts = 'passed'
  Save-Report

  $validatorScript = Join-Path $evidenceRoot 'validate-installed.cjs'
  $validatorCode = @'
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const root = process.argv[2], installed = process.argv[3];
  await require(path.join(root,'scripts/validate-tools.cjs')).validateTools(path.join(installed,'Tools'));
  const asar = require(path.join(root,'node_modules/@electron/asar'));
  let count = 0;
  function compare(relative) {
    const file = path.join(root, relative);
    if(fs.statSync(file).isDirectory()) { for(const item of fs.readdirSync(file)) compare(path.join(relative,item)); return; }
    const archived = asar.extractFile(path.join(installed,'app.asar'),relative);
    assert(fs.readFileSync(file).equals(archived),`Installed source differs: ${relative}`);
    count++;
  }
  compare('dist'); compare('dist-electron');
  const packed = JSON.parse(asar.extractFile(path.join(installed,'app.asar'),'package.json').toString());
  assert.equal(packed.name,'my-transcript-installer-smoke-test');
  console.log(`INSTALLED_SOURCE_AND_TOOLS_OK|compiledFiles=${count}|modelSha256=verified`);
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
'@
  [IO.File]::WriteAllText($validatorScript, $validatorCode, $utf8)
  Start-TestProcess $node @($validatorScript, $repoRoot, $resources) 'installed-tools' 300
  $lock = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $repoRoot 'Tools/tools-lock.json') | ConvertFrom-Json
  $report.model = $lock.model
  $report.checks.installedToolsAndModelSha256 = 'passed'
  $report.checks.installedCompiledSourceMatchesBuild = 'passed'
  Save-Report

  # A packaged EXE always loads its own app.asar. Check that real executable
  # through Chromium's loopback-only debugging socket, without adding a product hook.
  $listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 0)
  $listener.Start()
  $debugPort = $listener.LocalEndpoint.Port
  $listener.Stop()
  $launchConfig = Join-Path $evidenceRoot 'installed-launch-config.json'
  $launchEvidence = Join-Path $evidenceRoot 'installed-launch.json'
  [IO.File]::WriteAllText($launchConfig, (@{
    port = $debugPort; executable = $installedExe; sample = $MediaPath; evidence = $launchEvidence
    jobId = ('installer-exe-' + $runId)
    outputDirectory = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'My Sesi Metne Donusturme Ciktilar')
  } | ConvertTo-Json -Depth 5), $utf8)
  $launch = Start-TestProcess $installedExe @(
    ('--remote-debugging-port=' + $debugPort), '--remote-debugging-address=127.0.0.1',
    ('--user-data-dir=' + (Join-Path $evidenceRoot 'installed-exe-user-data')),
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost'
  ) 'installed-launch' -Background
  try {
    Start-TestProcess $node @((Join-Path $repoRoot 'scripts/installed-exe-smoke.cjs'), $launchConfig) 'installed-launch-check' 1800
  } finally {
    if (!$launch.Process.WaitForExit(10000)) {
      & "$env:SystemRoot/System32/taskkill.exe" /PID $launch.Process.Id /T /F | Out-Null
      $launch.Process.WaitForExit()
    }
    [IO.File]::WriteAllText((Join-Path $evidenceRoot 'installed-launch.stdout.log'), $launch.Stdout.GetAwaiter().GetResult(), $utf8)
    [IO.File]::WriteAllText((Join-Path $evidenceRoot 'installed-launch.stderr.log'), $launch.Stderr.GetAwaiter().GetResult(), $utf8)
  }
  $report.checks.installedExecutableLaunch = 'passed'
  $launchResult = Get-Content -Raw -Encoding UTF8 -LiteralPath $launchEvidence | ConvertFrom-Json
  if ($launchResult.status -ne 'passed') { throw 'The installed EXE transcription/export checks did not pass.' }
  $report.installedExecutableEvidence = $launchEvidence
  $report.checks.installedExecutableOfflineTranscriptionAndExports = 'passed'
  Save-Report

  # The smoke harness sets isolated app userData/documents before importing main
  # and blocks HTTP/HTTPS for all local-media, playback, export, and cancel checks.
  if ($SkipInstalledSourceSmoke) {
    $report.checks.installedSourceOfflineSmoke = 'reused-passed-prior-run'
    $report.installedSourceSmoke = $priorReport.installedSourceSmoke
  } else {
    $env:ELECTRON_APP_ROOT = $asar
    $env:ELECTRON_APP_RESOURCES = $resources
    $env:ELECTRON_TEST_MEDIA = $MediaPath
    Start-TestProcess (Join-Path $repoRoot 'node_modules/electron/dist/electron.exe') @((Join-Path $repoRoot 'scripts/electron-smoke.cjs')) 'installed-source-smoke' 3600
    $smokeLog = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $evidenceRoot 'installed-source-smoke.stdout.log')
    if ($smokeLog -notmatch 'ELECTRON_SMOKE_OK') { throw 'Installed source smoke success marker is missing.' }
    $report.checks.installedSourceOfflineSmoke = 'passed'
    $report.installedSourceSmoke = $smokeLog.Trim()
  }
  Save-Report
  Uninstall-TestApplication
  $installed = $false
  $report.status = 'passed'
} catch {
  $pendingError = $_
  $report.status = 'failed'
  $report.error = $_.Exception.Message
  if ((Test-Path -LiteralPath $installRoot) -and @(Get-ChildItem -LiteralPath $installRoot -Filter 'Uninstall *.exe' -File -ErrorAction SilentlyContinue).Count -eq 1) { $installed = $true }
} finally {
  if ($installed) {
    try { Uninstall-TestApplication } catch { $report.cleanupError = $_.Exception.Message }
  }
  foreach ($name in $originalEnvironment.Keys) { [Environment]::SetEnvironmentVariable($name, $originalEnvironment[$name], 'Process') }
  if ($null -ne $protectedBefore) {
    try {
      $protectedAfter = Get-ProtectedState
      $report.protectedAfter = $protectedAfter
      if (($protectedBefore | ConvertTo-Json -Depth 15 -Compress) -ne ($protectedAfter | ConvertTo-Json -Depth 15 -Compress)) {
        $report.status = 'failed'
        $report.checks.originalApplicationUnchanged = 'failed'
        if (!$pendingError) { $pendingError = 'The protected original application state changed; inspect result.json.' }
      } else { $report.checks.originalApplicationUnchanged = 'passed' }
    } catch { $report.protectionCheckError = $_.Exception.Message; $report.status = 'failed'; if (!$pendingError) { $pendingError = $_ } }
  }
  $report.finishedAt = [DateTime]::UtcNow.ToString('o')
  Save-Report
}
Write-Output ('INSTALLER_SMOKE_' + $report.status.ToUpperInvariant() + '|evidence=' + $reportPath)
if ($pendingError) { throw $pendingError }
