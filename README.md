# My Sesi Metne Dönüştürme

Windows 7, Windows 8, Windows 10 ve Windows 11 hedefli, .NET Framework 4.8 tabanlı WPF masaüstü uygulaması.

Uygulama; ses/video dosyalarını ve kullanıcının indirme hakkı olan YouTube içeriklerini yerel araçlarla metne dönüştürmek için hazırlanmıştır. Ücretsiz, reklamsız ve sınırsız kullanım yaklaşımıyla tasarlanmıştır; varsayılan çözüm ücretli bulut API'lerine bağlı değildir.

## Özellikler

- Tekli ve toplu dosya kuyruğu
- Sürükle-bırak dosya ekleme
- YouTube linki için izin/telif uyarısı, başlık/süre/küçük görsel alanı
- Dil seçimi: Türkçe, Otomatik Algıla, İngilizce, Almanca, Arapça
- Model seçimi: Hızlı, Dengeli, Yüksek Doğruluk
- Zaman damgası, paragraf düzenleme, dolgu kelimesi temizleme, noktalama iyileştirme
- Yüksek doğruluk varsayılan model ayarı, beam-search odaklı Whisper parametreleri
- İptal edilebilir arka plan işlemleri
- Düzenlenebilir metin editörü, arama, değiştirme, tümünü kopyalama
- PDF, Word `.docx`, TXT, SRT ve VTT dışa aktarma
- Yerel ayarlar, işlem geçmişi ve logs klasörü
- İlk açılışta gizlilik/kullanım bilgilendirmesi
- AI/müzik temalı ana sayfa, animasyonlu ses dalgaları ve açık/koyu tema

## Desteklenen Formatlar

`mp3`, `mp4`, `mpeg`, `mpga`, `m4a`, `wav`, `webm`, `mov`, `aac`, `ogg`, `opus`, `wma`, `wmv`, `avi`, `flac`, `mkv`

## Yerel Araçlar

Transkripsiyon için FFmpeg, whisper.cpp, Whisper model dosyası ve yt-dlp gerekir. Uygulama artık eksik araçları işlem başlatırken tek tıkla resmi kaynaklardan indirebilir ve `%LOCALAPPDATA%\MySesiMetneDonusturme\Tools` altında saklar.

İsterseniz araçları uygulama yanına da koyabilirsiniz:

```text
Tools/
  ffmpeg/
    ffmpeg.exe
    ffprobe.exe
  whisper/
    whisper-cli.exe
  models/
    ggml-base.bin
    ggml-tiny.bin    # Hızlı
    ggml-base.bin    # Dengeli
    ggml-small.bin   # Yüksek Doğruluk
  yt-dlp/
    yt-dlp.exe
```

İndirme kaynakları:

- yt-dlp: `https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe`
- whisper.cpp: `https://github.com/ggml-org/whisper.cpp/releases/latest/download/whisper-bin-x64.zip`
- FFmpeg: `https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip`
- Whisper hızlı model: `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin`
- Whisper dengeli model: `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin`
- Whisper yüksek doğruluk modeli: `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin`

## Build

Bu makinede `dotnet` ve MSBuild bulunmadığı için proje, Windows içindeki .NET Framework C# derleyicisiyle derlenir.

```powershell
.\build.ps1
```

Çıktı:

```text
build\bin\MySesiMetneDonusturme.exe
```

Build scripti ayrıca masaüstünde şu klasörü oluşturur:

```text
MySesiMetneDonusturme_Build
```

## Kurulum Dosyası

`build.ps1`, Inno Setup gerektirmeden .NET Framework tabanlı küçük bir kurulum paketi de üretir:

```text
dist\MySesiMetneDonusturme_Setup_v1.0.0.exe
```

Setup dosyası Program Files içine kurulum yapar, masaüstü kısayolu ve Başlat menüsü kısayolu oluşturur. Yönetici izni ister.

Ek olarak `installer\MySesiMetneDonusturme.iss` Inno Setup 6 scripti de hazırdır. Inno Setup kuruluysa alternatif Inno paketi için:

```powershell
.\build.ps1 -Installer
```

Beklenen setup adı:

```text
MySesiMetneDonusturme_Setup_v1.0.0.exe
```

Script setup dosyasını masaüstüne ve `MySesiMetneDonusturme_Build` klasörüne kopyalar.

## Kullanım

1. Uygulamayı açın.
2. İlk işlemde araç indirme sorusu gelirse onaylayın.
3. Dosya Yükle ekranında dosya seçin veya sürükleyip bırakın.
4. Dil, model ve metin düzenleme seçeneklerini seçin.
5. Başlat düğmesine basın.
6. Metni düzenleyin ve PDF, Word, TXT, SRT veya VTT olarak dışa aktarın.

YouTube özelliğinde yalnızca indirme ve yazıya çevirme hakkınız olan içerikleri kullanın.

## Yerel Veri ve Gizlilik

- Ayarlar ve geçmiş: `%LOCALAPPDATA%\MySesiMetneDonusturme`
- Loglar: `%LOCALAPPDATA%\MySesiMetneDonusturme\logs`
- Geçici işler: `%LOCALAPPDATA%\MySesiMetneDonusturme\work`
- Otomatik indirilen araçlar: `%LOCALAPPDATA%\MySesiMetneDonusturme\Tools`
- Varsayılan çıktı klasörü: Belgeler altında `My Sesi Metne Donusturme Ciktilar`

Varsayılan tasarım yereldir. Dosyalar kullanıcı açıkça YouTube linki işlediğinde internetten veri indirir; ses/video dosyaları ücretli bulut API'lerine gönderilmez.

## Bilinen Sınırlamalar

- İlk yüksek doğruluk transkripsiyonu öncesinde `ggml-small.bin` model indirme süresi internet hızına göre uzayabilir.
- Harf/yazım doğruluğu ses kalitesine, arka plan gürültüsüne, konuşmacı netliğine ve model boyutuna bağlıdır; uygulama varsayılan olarak daha doğru model ve daha dikkatli Whisper ayarları kullanır.
- YouTube iş akışı için internet bağlantısı gerekir.
- PDF dışa aktarma gömülü PDF kütüphanesi kullanmadan üretilir; Türkçe karakterler PDF içinde okunabilir ASCII karşılıklarına sadeleştirilir. DOCX ve TXT çıktıları Türkçe karakterleri korur.
- Inno Setup bu bilgisayarda kurulu değil; bu nedenle Inno tabanlı alternatif paket test edilmedi. Dahili .NET setup paketi üretilir.
- Çok uzun dosyalarda işlem süresi tamamen bilgisayarın CPU/RAM/disk performansına bağlıdır.

## GitHub

Remote yetkisi tanımlı değilse `GITHUB_UPLOAD_COMMANDS.md` dosyasındaki komutları kullanın. Önerilen repo adı:

```text
My-Sesi-Metne-Donusturme
```

Hesap: `@vildancam`
