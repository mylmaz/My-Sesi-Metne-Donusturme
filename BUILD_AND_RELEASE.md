# Build ve Yayın

Windows 10/11 x64, Node.js 20+ ve en az 10 GB boş alan gerekir.

```powershell
npm ci
powershell -ExecutionPolicy Bypass -File scripts/prepare-tools.ps1 -IncludeLargeV2Model
npm run typecheck
npm run test:electron
npm run dist
```

Araç ve model dosyaları Git'e eklenmez. Son kullanıcı dağıtımı `release/My-Sesi-Metne-Donusturme-Setup-v1.0.0.zip` dosyasıdır ve içinde tek kurulum EXE'si bulunur. Model ilk kullanımda kaldığı yerden devam edebilir biçimde indirilip SHA-256 ile doğrulanır.

Kod imzalama sertifikası bu projede bulunmadığından paketler imzasızdır; sahte imza veya güvenlik atlatma uygulanmaz.
