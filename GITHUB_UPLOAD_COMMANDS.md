# GitHub yükleme kontrol listesi

Remote zaten tanımlıdır:

```text
origin  https://github.com/vildancam/My-Sesi-Metne-Donusturme.git
```

Önce büyük veya gizli dosya olmadığını doğrulayın:

```powershell
git status --short
git diff --check
git ls-files | Select-String -Pattern "node_modules|dist-electron-package|Tools/models|\.exe$|\.bin$|\.env$|\.pfx$"
```

Ardından değişiklikleri inceleyerek ekleyin:

```powershell
git add .
git status --short
git commit -m "fix: improve transcription workflow, ui layout, cancellation and packaging"
git push origin main
```

Whisper modeli ve installer normal Git commit'ine eklenmez. Tercihen GitHub Releases kullanın; LFS kullanılacaksa önce `git lfs install` çalıştırın. Force push yapmayın.
