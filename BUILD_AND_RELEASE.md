# Build ve Yayın

Windows 10/11 x64, Node.js 20+ ve en az 10 GB boş alan gerekir.

```powershell
npm ci
powershell -ExecutionPolicy Bypass -File scripts/prepare-tools.ps1 -IncludeLargeV2Model
npm run typecheck
npm run test:electron
npm run dist
```

Araç ve model dosyaları Git'e eklenmez. `prepare-tools.ps1` resmi yt-dlp, FFmpeg, whisper.cpp ve Hugging Face whisper.cpp model kaynağından indirir. Standart installer/portable paket modeli ilk kullanımda indirir; full-offline ZIP modelle birlikte ayrıca hazırlanır. Üretim çıktıları `release/` altında toplanır ve SHA-256 değerleri `SHA256SUMS.txt` dosyasına yazılır.

Kod imzalama sertifikası bu projede bulunmadığından paketler imzasızdır; sahte imza veya güvenlik atlatma uygulanmaz.
