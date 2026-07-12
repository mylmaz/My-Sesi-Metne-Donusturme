# GitHub Yükleme Kontrol Listesi

Remote:

```text
origin  https://github.com/mylmaz/My-Sesi-Metne-Donusturme.git
```

Kontrol:

```powershell
git status --short
git diff --check
npm run typecheck
npm run build
```

Commit ve push:

```powershell
git add .
git status --short
git commit -m "fix: complete real transcription workflow and installer"
git push origin main
```

`Tools/**/*.exe`, `Tools/models/*.bin`, `dist-electron-package`, `dist` ve setup çıktıları Git commit'ine eklenmez. `dist-electron-package/My-Sesi-Metne-Donusturme-Setup-x64.exe` dosyasını GitHub Release eki olarak yükleyin.
