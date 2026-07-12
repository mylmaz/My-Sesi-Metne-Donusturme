# Test Raporu

Tarih: 2026-07-12  
Platform: Windows x64

## Otomatik doğrulamalar

- TypeScript renderer ve Electron ana süreç typecheck: geçti.
- Vite üretim derlemesi: geçti.
- 1366×768, 1600×900 ve 1920×1080 taşma smoke kontrolü: geçti.
- Gerçek WAV → FFmpeg 16 kHz mono PCM → whisper.cpp large-v2 transkripsiyonu: geçti.
- Gerçek child-process iptali: geçti.
- TXT, DOCX ve metin tabanlı PDF üretimi ve sıfırdan büyük dosya doğrulaması: geçti.
- TXT UTF-8 BOM/CRLF ve Türkçe Unicode yolu: uygulandı ve smoke export ile doğrulandı.
- Uygulama başlangıcı ve renderer IPC köprüsü: geçti.
- Standart NSIS installer, portable ZIP ve full-offline ZIP üretimi: geçti.
- Üç dağıtım dosyası için SHA-256 üretimi: geçti.

Komut: `npm run test:electron`

YouTube canlı testi ağ ve üçüncü taraf video kullanılabilirliğine bağlı olduğu için varsayılan smoke koşusunda atlanır. `ELECTRON_TEST_YOUTUBE` verilerek aynı testte metadata, indirme, kalıcı ses ve transkripsiyon zinciri çalıştırılır.

Kod imzası ve ayrı fiziksel temiz Windows makinesi mevcut değildir. Paketli uygulama Electron smoke testi ve yerel Windows ortamında build doğrulamasıyla kontrol edilmiştir.

## Üretilen paketler

- `release/My-Sesi-Metne-Donusturme-Setup-v1.0.0.exe`
- `release/My-Sesi-Metne-Donusturme-Portable-v1.0.0-win-x64.zip`
- `release/My-Sesi-Metne-Donusturme-Full-Offline-v1.0.0-win-x64.zip`
- `release/SHA256SUMS.txt`
