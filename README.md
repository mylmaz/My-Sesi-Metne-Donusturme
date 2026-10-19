# My Sesi Metne Dönüştürme

Windows 10/11 x64 için Electron 34, React 18 ve TypeScript ile geliştirilmiş yerel ses/video transkripsiyon uygulaması. Yerel medya, Whisper modeli ve dışa aktarma işlemleri kurulumdan itibaren çevrimdışı çalışır. YouTube bilgisi ve sesi almak için internet gerekir.

Geliştirici: Mustafa Yılmaz · Sürüm: 1.0.0 · Uygulama kaynak lisansı: MIT

## Özellikler

- Dosya Seç ve Windows dosya sürükle-bırak ile çoklu medya ekleme; iki yöntem aynı doğrulama ve FFprobe akışını kullanır.
- MP3, WAV, M4A, MP4, WEBM, MPEG, MPGA, MOV, AVI, MKV, FLAC, AAC, OGG, OPUS, WMA ve WMV desteği.
- YouTube video bilgisi, isteğe bağlı ses önizlemesi ve gerçek ses indirme/Whisper transkripsiyonu.
- Yerel ve YouTube kaynaklarında oynat/duraklat, 10 saniye ileri/geri, zaman, ilerleme ve ses seviyesi kontrolleri.
- Whisper **Large-v2 q5_0**; tüm kalite seçenekleri aynı modeli kullanır: Hızlı Beam 4, Dengeli Beam 6, Yüksek Doğruluk Beam 8.
- Her iki ekranda aynı dil sırası: **Otomatik, Türkçe, İngilizce, Almanca**. Seçim kaydedilir ve ekranlar arasında paylaşılır.
- Otomatik mod `-l auto` kullanır, dil yönlendiren başlangıç metni göndermez; modelin desteklediği diller arasından seçim yapar. Gerçek algılama sonucu varsa sonuç ekranında dil kodu gösterilir. Desteklenmeyen diller için doğruluk garantisi yoktur.
- İşlem kuyruğu, aşama/ilerleme, gerçek süreç iptali, geçmiş ve ayarlar.
- UTF-8 TXT, Türkçe karakter destekli PDF ve DOCX dışa aktarma.

Mevcut cam efektli tasarım korunmuştur. Almanca kartının görseli proje klasöründe bulunan `Almanca.png` dosyasından içeriği değiştirilmeden alınmıştır. Eski kayıtlı Kürtçe varsayılanı Otomatik seçimine taşınır; eski transkript içerikleri korunur.

## Aktif proje

```text
src/main        Electron, güvenli medya protokolü, FFmpeg/Whisper/yt-dlp, dışa aktarma
src/preload     contextIsolation altında sınırlı IPC ve webUtils köprüsü
src/renderer    React arayüzü ve mevcut görseller
Tools           Çevrimdışı paket araçları, model, lisanslar ve bütünlük kilidi
scripts         Araç hazırlığı, build doğrulaması ve gerçek Electron/kurulum testleri
resources       Uygulama/NSIS ikonları
installer       Aktif NSIS yardımcı makroları
```

`src/MySesiMetneDonusturme`, kökteki `build.ps1` ve eski C# kurulum dosyaları önceki WPF uygulamasına aittir. Aktif Electron sürümünü oluşturmak için aşağıdaki npm komutlarını kullanın.

## Geliştirme ve çevrimdışı paket hazırlığı

Windows x64, Node.js 20 veya daha yeni LTS ve npm gerekir. Geliştirici hazırlığı ağ erişimi ve model/araç/paket kopyaları için yeterli disk alanı gerektirir; en az 8 GB boş alan önerilir.

```powershell
npm ci
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/prepare-tools.ps1
npm run typecheck
npm run build
npm run dev
```

`prepare-tools.ps1` yalnızca geliştirici/build aşamasında çalışır. Resmî kaynaklardan kilitlenmiş sürümleri indirir, SHA256 değerlerini kontrol eder, gereken DLL ve lisansları hazırlar. Son kullanıcının ilk açılışında araç veya model indirilmez.

Model dosyası `Tools/models/ggml-large-v2-q5_0.bin` olup 1.080.732.091 bayttır. Beklenen SHA256:

```text
3a214837221e4530dbc1fe8d734f302af393eb30bd0ed046042ebf4baf70f6f2
```

Önceki `q5_k` dosya adı resmî model kaynağıyla eşleşmediği için indirme, paketleme ve çalışma zamanı resmî **Large-v2 q5_0** dosyasında birleştirilmiştir; small/medium modele geçilmez. Kaynak: [whisper.cpp modelleri](https://huggingface.co/ggerganov/whisper.cpp/tree/main).

Kurulum FFmpeg/FFprobe ve onların DLL'lerini, yt-dlp, YouTube JavaScript işlemleri için Deno, whisper-cli/Whisper/ggml CPU DLL'lerini, gerekli uygulama yanındaki Visual C++ çalışma zamanı DLL'lerini ve modeli içerir. Eksik/bozuk bileşen paketleme sırasında hata verir. Araç sürümleri ve kaynakları `Tools/tools-lock.json` içinde kayıtlıdır. Yeniden dağıtım koşulları için `Tools/README.md` ve paket içindeki `Tools/licenses` dizinine bakın; harici bileşenlerin kendi lisansları geçerlidir.

Paketleme aracı, eski sürümün PDF bağımlılıklarını yanlış konuma yerleştirme hatasını gidermek için electron-builder **26.17.0** olarak sabitlenmiştir; Electron 34 ve NSIS korunur. Eksik üretim bağımlılıkları reddedilir. Paket içindeki gerçek EXE/ASAR ile Unicode PDF ve DOCX üretimi, geliştirme klasöründeki modüllerden yararlanmadan, NSIS sıkıştırmasından önce test edilir.

## Doğrulama

```powershell
npm run typecheck
npm run build
$env:ELECTRON_TEST_MEDIA = 'C:\medya\kisa-konusma.wav'
npm run test:electron
```

Electron testi gerçek FFmpeg ve Large-v2 modelini çalıştırır; sahte transkript üretmez. Test verileri ve çıktıları `build` altında yalıtılır. Ek dil ve isteğe bağlı internet/YouTube test değişkenleri için `scripts/electron-smoke.cjs` ve gerçek çalıştırma sonuçları için [TEST_NOTES.md](TEST_NOTES.md) dosyasına bakın. Dosya Gezgini'nde elle gerçekleştirilen test ile DevTools üzerinden yerel dosya bırakma testi ayrı değerlendirilir.

## Windows x64 NSIS Setup

```powershell
npm run dist
```

Paketleme bütünlük kontrolü indirilen araçların/modelin mevcut olduğunu doğrular. Başarılı çıktı:

```text
dist-electron-package/My-Sesi-Metne-Donusturme-Setup-x64.exe
```

Bu dosya ayrıca Windows'un gerçek Masaüstü klasörü sorgulanarak `My-Sesi-Metne-Donusturme-Setup-x64.exe` adıyla kopyalanır. Kurulum kendi başına çalışır; internetten ek paket/model almaz. Masaüstü ve Başlat menüsü kısayolları korunur. Kaldırma kullanıcı ayarları ve geçmişini silmez.

Temiz Windows 10/11 bilgisayarda çevrimdışı kurulum kabul testi ayrıca yapılmalıdır. Mevcut kullanıcı kurulumunu kaldırmamak için otomatik kurulum testi ayrı uygulama kimliğiyle aynı kaynak ve kaynak dosyalarını paketler; bu testin kapsamı ve kısıtları TEST_NOTES içinde açıkça belirtilir.

## Veriler ve güvenlik

- Ayarlar/geçmiş: Electron `userData/data`.
- İşlem dosyaları: `userData/data/work`; tamamlanınca veya iptal edilince temizlenir.
- Ses önbelleği: `userData/data/audio-cache`. YouTube indirmesi transkripsiyon ve önizleme arasında paylaşılır; oynatma dosyaları işlem klasörü temizliğinden etkilenmez. Başlangıçta 30 gün/2 GB sınırına göre temizlenir; oturumda kullanılan sesler oynatma sırasında silinmez.
- Çıktılar: Windows Belgeler klasörü altındaki `My Sesi Metne Donusturme Ciktilar`.
- Teknik günlük: Windows geçici klasöründeki `MySesiMetneDonusturme-electron.log`.

`contextIsolation` açık, `nodeIntegration` kapalıdır. Renderer yalnızca uygulamanın hazırladığı seslere opak `app-media` URL'leriyle erişir; protokol keyfî dosya yolu sunmaz ve seek için byte aralıklarını destekler. Dış gezinme/pencere açma engellenir. YouTube bağlantısı değişince eski video bilgisi ve bekleyen bilgi yanıtı yeni kaynak için kullanılmaz.

Yalnızca erişim hakkınız bulunan desteklenen YouTube içeriklerini işleyin. Oturum, yaş/bölge veya servis kısıtlamaları yüzünden bazı videolar indirilemeyebilir; teknik neden günlüğe ve anlaşılır açıklama arayüze yazılır.

## GitHub

Depo: [mylmaz/My-Sesi-Metne-Donusturme](https://github.com/mylmaz/My-Sesi-Metne-Donusturme).

Kaynakları ve küçük dil görselini commit edin. Model, EXE/DLL, node_modules, test medyası ve build/kurulum çıktıları normal Git geçmişine eklenmez. Büyük Setup dosyası için GitHub Releases uygundur; yayınlama ayrıca yetkilendirilip gerçekleştirilmelidir. [GitHub komutları](GITHUB_UPLOAD_COMMANDS.md) force push kullanmadan mevcut dalın güncellenmesini açıklar.
