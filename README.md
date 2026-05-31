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
- İptal edilebilir arka plan işlemleri
- Düzenlenebilir metin editörü, arama, değiştirme, tümünü kopyalama
- PDF, Word `.docx`, TXT, SRT ve VTT dışa aktarma
- Yerel ayarlar, işlem geçmişi ve logs klasörü
- İlk açılışta gizlilik/kullanım bilgilendirmesi

## Desteklenen Formatlar

`mp3`, `mp4`, `mpeg`, `mpga`, `m4a`, `wav`, `webm`, `mov`, `aac`, `ogg`, `opus`, `wma`, `wmv`, `avi`, `flac`, `mkv`

## Yerel Araçlar

Transkripsiyonun gerçekten çalışması için aşağıdaki ücretsiz yerel araçlar uygulamanın yanında bulunmalıdır:

```text
Tools/
  ffmpeg/
    ffmpeg.exe
    ffprobe.exe
  whisper/
    whisper-cli.exe
  models/
    ggml-base.bin
    ggml-small.bin
    ggml-medium.bin
  yt-dlp/
    yt-dlp.exe
```

Uygulama açıldığında Ayarlar ekranında bu bileşenleri kontrol eder. Eksik araç varsa kullanıcıya teknik olmayan Türkçe uyarı gösterilir. Bu dosyalar lisans ve boyut nedenleriyle repoya eklenmez.

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

Kurulum için `installer\MySesiMetneDonusturme.iss` Inno Setup 6 scripti hazırdır. Bu bilgisayarda Inno Setup kurulu değilse setup üretilemez. Kurduktan sonra:

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
2. Ayarlar ekranında FFmpeg, Whisper ve yt-dlp durumunu kontrol edin.
3. Dosya Yükle ekranında dosya seçin veya sürükleyip bırakın.
4. Dil, model ve metin düzenleme seçeneklerini seçin.
5. Başlat düğmesine basın.
6. Metni düzenleyin ve PDF, Word, TXT, SRT veya VTT olarak dışa aktarın.

YouTube özelliğinde yalnızca indirme ve yazıya çevirme hakkınız olan içerikleri kullanın.

## Yerel Veri ve Gizlilik

- Ayarlar ve geçmiş: `%LOCALAPPDATA%\MySesiMetneDonusturme`
- Loglar: `%LOCALAPPDATA%\MySesiMetneDonusturme\logs`
- Geçici işler: `%LOCALAPPDATA%\MySesiMetneDonusturme\work`
- Varsayılan çıktı klasörü: Belgeler altında `My Sesi Metne Donusturme Ciktilar`

Varsayılan tasarım yereldir. Dosyalar kullanıcı açıkça YouTube linki işlediğinde internetten veri indirir; ses/video dosyaları ücretli bulut API'lerine gönderilmez.

## Bilinen Sınırlamalar

- Gerçek transkripsiyon için `whisper-cli.exe`, model dosyaları ve FFmpeg gereklidir.
- YouTube iş akışı için `yt-dlp.exe` ve internet bağlantısı gerekir.
- PDF dışa aktarma gömülü PDF kütüphanesi kullanmadan üretilir; Türkçe karakterler PDF içinde okunabilir ASCII karşılıklarına sadeleştirilir. DOCX ve TXT çıktıları Türkçe karakterleri korur.
- Inno Setup bu bilgisayarda kurulu değilse setup `.exe` build sırasında üretilemez.
- Çok uzun dosyalarda işlem süresi tamamen bilgisayarın CPU/RAM/disk performansına bağlıdır.

## GitHub

Remote yetkisi tanımlı değilse `GITHUB_UPLOAD_COMMANDS.md` dosyasındaki komutları kullanın. Önerilen repo adı:

```text
My-Sesi-Metne-Donusturme
```
