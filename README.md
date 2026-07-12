# My Sesi Metne Dönüştürme

Windows için tek tıkla kurulabilen masaüstü ses/video transkripsiyon uygulaması. Yerel medya dosyalarını ve YouTube videolarının sesini Whisper `large-v2` modeliyle metne dönüştürür; sonucu zaman damgalı şekilde gösterir ve TXT, DOCX, PDF olarak dışa aktarır.

## Kullanıcı İçin Kurulum

1. GitHub Release sayfasından `My-Sesi-Metne-Donusturme-Setup-v1.0.0.exe` dosyasını indirin.
2. Dosyaya çift tıklayın ve kurulum adımlarını izleyin.
3. Kurulum sonunda masaüstü kısayolu ve Başlat menüsü kısayolu oluşur.
4. Uygulamayı açın; terminal, Python veya npm komutu gerekmez.

Kurulum paketi FFmpeg, FFprobe, yt-dlp ve whisper-cli içerir. Standart kurulum `large-v2` modelini ilk dönüşümde kaldığı yerden devam edebilir biçimde indirir ve SHA-256 ile doğrular. İnternetsiz kurulum için modelin de içinde bulunduğu `Full-Offline` ZIP paketini kullanın.

## Yerel Ses veya Video Dönüştürme

1. `Dosya Seç` düğmesine basın veya dosyayı ana ekrana sürükleyip bırakın.
2. Gerekirse kalite ve dil ayarını seçin. Varsayılan dil Türkçe, varsayılan model Whisper `large-v2` olur.
3. `Dönüştür` düğmesine basın.
4. İşlem bitince sonuç ekranı açılır. Her segment şu biçimde görünür:

```text
[00:00 - 00:12] Merhaba bugün sizlere...
[00:12 - 00:28] Bu videoda...
```

Desteklenen yaygın biçimler: MP3, WAV, M4A, MP4, WEBM, MOV, AVI, MKV, FLAC, AAC, OGG, OPUS, WMA, WMV.

## YouTube Dönüştürme

1. YouTube bağlantısını ana ekrandaki kutuya yapıştırın.
2. `Bilgi Getir` ile başlık, kanal, süre ve küçük resmi görüntüleyin.
3. `Dönüştür` düğmesine basın; gerekli ses bu aşamada indirilir.
4. Uygulama yt-dlp ile gerçek sesi indirir, aynı ses dosyasını oynatıcıda çalar ve Whisper `large-v2` ile dönüştürür.

Yanlış bağlantı, internet kesintisi veya indirilemeyen video durumunda kullanıcıya anlaşılır hata mesajı gösterilir.

## Ses Oynatıcı

Yerel dosya ve YouTube sesi aynı oynatıcıyı kullanır. Play/pause, 10 saniye geri, 10 saniye ileri, ses seviyesi ve mute düğmesi gerçek ses üzerinde çalışır. Süre dakika:saniye biçiminde gösterilir.

## Çıktı Alma

Sonuç ekranındaki düğmelerle çıktı alınabilir:

- `TXT`: Windows Not Defteri uyumlu UTF-8 BOM ve CRLF metin dosyası
- `Word`: DOCX raporu
- `PDF`: Türkçe karakter destekli PDF raporu

Kaydetme sırasında dosya konumu kullanıcıya sorulur. Varsayılan dosya adı:

```text
kaynak_adi_transkript_YYYY-MM-DD_HH-mm
```

## Hata Mesajları ve Çözümler

- `Whisper large-v2 modeli yüklenemedi`: Model eksik, bozuk veya bellek yetersiz olabilir. Uygulamayı yeniden kurun.
- `FFmpeg bulunamadı`: Kurulum bozuk olabilir. Setup dosyasını yeniden çalıştırın.
- `YouTube sesi alınamadı`: İnternet bağlantısını ve video bağlantısını kontrol edin.
- `Dosyada kullanılabilir bir ses kanalı bulunamadı`: Video/ses dosyasında okunabilir ses yoktur.
- `Medya dosyası bozuk`: Dosyayı farklı bir oynatıcıda deneyin veya başka bir kopyasını kullanın.
- `Dosya yazma izni yok`: Farklı bir klasöre kaydedin.
- `Diskte yeterli boş alan yok`: Diskte yer açın.
- `Bilgisayar belleği yetersiz kaldı`: Diğer programları kapatın veya daha kısa bir dosya deneyin.

Yardım ekranındaki `Tanılama klasörünü aç` düğmesi teknik kayıtları gösterir. Sesler ve metinler herhangi bir sunucuya gönderilmez. Geçmiş ve ayarlar Windows kullanıcı veri klasöründe, YouTube sesleri ise aynı klasörün yönetilen veri alanında saklanır. Yerel dosya dönüştürme tamamen çevrimdışıdır; yalnızca YouTube işlemleri internet gerektirir.

## Geçmiş, Düzenleme ve Zaman Akışı

Tamamlanan kayıtlar Geçmiş ekranında kalır. Sonucu açınca metni doğrudan düzenleyebilirsiniz; değişiklikler otomatik kaydedilir ve dışa aktarımda son düzenlenmiş metin kullanılır. Zaman Akışı bölümünde arama yapabilir, bir zaman koduna tıklayıp sesi o noktadan başlatabilirsiniz. Orijinal metne dönüş yalnızca kullanıcı onayıyla yapılır.

## Geliştirici Kurulumu

Gereksinimler:

- Windows 10/11 x64
- Node.js 20 veya daha yeni LTS
- npm
- En az 8 GB boş disk alanı

```powershell
npm ci
npm run dev
```

## Kontrol, Test ve Build

```powershell
npm run typecheck
npm run build
npm run test:electron
npm run dist
```

`npm run dist` çıktısı:

```text
release/My-Sesi-Metne-Donusturme-Setup-v1.0.0.exe
```

Aktif proje yapısı:

```text
src/main       Electron ana süreç, FFmpeg/Whisper/yt-dlp/export işlemleri
src/preload    Güvenli IPC köprüsü
src/renderer   React + TypeScript arayüz
resources      Uygulama ikonu
Tools          FFmpeg, yt-dlp, whisper-cli ve ggml-large-v2.bin
scripts        Electron smoke/build yardımcı scriptleri
```

## GitHub Release Notu

Model, FFmpeg ve installer çıktıları büyük olduğu için Git commit'ine eklenmez. Release oluştururken `dist-electron-package/My-Sesi-Metne-Donusturme-Setup-x64.exe` dosyasını GitHub Release eki olarak yükleyin.

Push öncesi önerilen kontrol:

```powershell
git status --short
git diff --check
npm run typecheck
npm run build
```
