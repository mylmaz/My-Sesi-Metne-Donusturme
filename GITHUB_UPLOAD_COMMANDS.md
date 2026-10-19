# GitHub güncelleme

Aktif depo: `https://github.com/mylmaz/My-Sesi-Metne-Donusturme.git`.

Mevcut değişiklikleri koruyarak önce kontrol edin:

```powershell
git status --short
git branch -vv
git remote -v
git diff --check
npm run typecheck
npm run build
```

İncelenmiş kaynak, belge, script ve küçük görsel dosyalarını açık yollarıyla stage edin. Geçici dosya, kişisel dosya, token/anahtar, EXE/DLL, Whisper modeli, test medyası ve build klasörü eklemeyin. Stage edilen içeriği doğrulayın:

```powershell
git diff --cached --stat
git diff --cached --name-only
git commit -m "fix: resolve queue overflow exports timestamp navigation and transcript reliability"
git push origin main
git fetch origin
git status -sb
git rev-parse HEAD
git rev-parse origin/main
```

Dal `main` değilse doğrulanan mevcut dal adını kullanın. Kullanıcı çalışmalarını silmeyin, reset veya force push yapmayın. Uzak dal ilerlediyse önce farklılıkları inceleyin ve güvenli birleştirme yapın. Push kimlik doğrulaması isterse GitHub hesabını Git/credential manager üzerinden yetkilendirin; tokenı kaynak dosyasına veya komut çıktısına yazmayın.

Model ve kurulum normal Git commit'ine eklenmez. Setup için GitHub Release eki kullanılabilir; bu çalışma otomatik olarak Release yayımlamaz. Yeniden dağıtılan araç/model lisansları `Tools/README.md`, kaynak/sürüm/hash bilgileri `Tools/tools-lock.json` içinde tutulur.
