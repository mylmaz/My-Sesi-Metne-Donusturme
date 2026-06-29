# My Sesi Metne Dönüştürme

Windows x64 için yerel ses, video ve YouTube transkripsiyon uygulaması. Yerel dosyalar cihazdan dışarı gönderilmez ve ücretli API kullanılmaz. İnternet yalnızca YouTube içeriğine erişmek için gerekir.

- Geliştirici: Mustafa Yılmaz
- Sürüm: 1.0.0
- Lisans: MIT

## Özellikler

- MP3, WAV, M4A, MP4, WEBM, MPEG, MPGA, MOV, AVI, MKV, FLAC, AAC, OGG, OPUS, WMA ve WMV desteği
- YouTube video bilgisi alma ve sesi indirerek dönüştürme
- Whisper Large-v2 ile tamamen yerel transkripsiyon
- Otomatik, Türkçe, Kürtçe ve İngilizce dil seçenekleri
- Hızlı (Beam 4), Dengeli (Beam 6) ve Yüksek Doğruluk (Beam 8) modları
- Gerçek işlem iptali ve Windows child-process ağacı sonlandırma
- UTF-8 TXT, Türkçe karakter uyumlu PDF ve DOCX çıktısı
- Açık renkli, cam efektli Electron + React arayüz

## Aktif proje yapısı

```text
src/main       Electron ana süreç, FFmpeg/Whisper/yt-dlp ve export işlemleri
src/preload    İzole renderer için güvenli IPC köprüsü
src/renderer   React + TypeScript kullanıcı arayüzü
resources      Electron ve NSIS uygulama ikonu
Tools          Harici çalışma zamanı araçları ve yerel model
scripts        Electron doğrulama ve eski sürüme ait yardımcı testler
```

`src/MySesiMetneDonusturme` ve kökteki eski installer dosyaları önceki WPF sürümüne aittir. Aktif uygulama Electron sürümüdür; geçmiş sürüm doğrulaması yapılmadan bu dosyalar silinmemelidir.

## Gereksinimler

- Windows 10/11 x64
- Node.js 20 veya daha yeni LTS
- npm
- Paketleme için yeterli boş disk alanı (en az 5 GB önerilir)

## Çalışma zamanı dosyaları

Aşağıdaki dosyalar geliştirme ortamında bulunmalıdır:

```text
Tools/ffmpeg/ffmpeg.exe
Tools/ffmpeg/ffprobe.exe
Tools/yt-dlp/yt-dlp.exe
Tools/whisper/whisper-cli.exe
Tools/whisper/whisper.dll
Tools/whisper/ggml.dll
Tools/whisper/ggml-base.dll
Tools/whisper/ggml-cpu.dll
Tools/models/ggml-large-v2-q5_k.bin
```

Binary ve model dosyaları boyutları nedeniyle normal Git commit'ine eklenmez. Bunları GitHub Release eki olarak yayımlamak önerilir. Git LFS kullanılacaksa önce `git lfs install` çalıştırılmalıdır.

## Kurulum ve geliştirme

```powershell
npm ci
npm run dev
```

`npm run dev`, Vite sunucusunu `127.0.0.1:5173` üzerinde açar ve Electron uygulamasını başlatır.

## Kontrol ve build

```powershell
npm run typecheck
npm run build
```

Production build çıktıları `dist` ve `dist-electron` klasörlerinde oluşur.

Mevcut kısa test medyası varsa gerçek Electron transkripsiyon, TXT/PDF/DOCX export ve süreç iptali testi:

```powershell
$env:ELECTRON_TEST_MEDIA = "C:\medya\kisa-test.wav"
npm run test:electron
```

## Windows installer

```powershell
npm run dist
```

Çıktı:

```text
dist-electron-package/My-Sesi-Metne-Donusturme-Setup-x64.exe
```

Installer FFmpeg, FFprobe, yt-dlp, gerekli Whisper DLL'leri ve `ggml-large-v2-q5_k.bin` modelini içerir. Paket büyük olduğu için installer normal Git commit'ine eklenmemeli, GitHub Releases üzerinden yayımlanmalıdır.

## Uygulama verileri

- Ayarlar ve geçmiş: Electron `userData/data` dizini
- Geçici çalışma dosyaları: `userData/data/work`; işlem bitince veya iptal edilince temizlenir
- Transkript çıktıları: `%USERPROFILE%\Documents\My Sesi Metne Donusturme Ciktilar`

## GitHub'a güvenli yükleme

Push öncesinde:

```powershell
git status --short
git diff --check
git ls-files | Select-String -Pattern "node_modules|dist-electron-package|Tools/models|\.exe$|\.bin$"
```

Beklenmeyen büyük dosya görünmüyorsa:

```powershell
git add .
git status --short
git commit -m "fix: improve transcription workflow, ui layout, cancellation and packaging"
git push origin main
```

Force push kullanılmamalıdır. Token, `.env`, sertifika ve özel anahtarlar repoya eklenmemelidir.
