# Electron doğrulama raporu

Doğrulama oturumu: 18–19 Ekim 2026 (Europe/Istanbul). Aktif uygulama Electron sürümüdür; eski C#/WPF kaynakları değiştirilmemiştir.

## Uygulanan değişiklikler

- Electron 34'te kaldırılmış File.path yerine preload webUtils.getPathForFile kullanıldı. Çoklu dosya bırakma ve Dosya Seç aynı uzantı/dosya/FFprobe doğrulamasını kullanıyor; desteklenmeyen dosya Türkçe uyarı veriyor, pencere dışına bırakma gezinmeye neden olmuyor.
- YouTube adresleri tek video kimliğine göre kanonik hale getiriliyor; bilgi alma ve indirme ayrı. yt-dlp Deno ve FFmpeg konumlarını kullanıyor, gerçek after_move çıktısı UTF-8 okunuyor; yarım indirme dosyaları seçilmiyor.
- Yerel ve YouTube sesleri isteğe bağlı MP3 hazırlanarak güvenli, opak app-media URL'leri üzerinden oynatılıyor. Byte aralığı/seek desteği var. Kaynak indirmesi önizleme/transkripsiyon arasında tekrar kullanılıyor; iş klasörü temizliği oynatılan dosyayı silmiyor.
- Dil kartları iki ekranda ortak: Otomatik/Türkçe/İngilizce/Almanca. Yeni Almanca görseli masaüstündeki proje klasöründe bulunan Almanca.png dosyasının aynısıdır; orijinal SHA256 CC824725CA7C25C2630B10313F298761A95048F48BF7B0E9C152A1892D233867.
- Eski Kürtçe varsayılanı Otomatik olarak kaydediliyor. Otomatik mod açık -l auto ve yönlendirmeyen boş prompt kullanıyor; gerçek algılanan dil kodu varsa sonuçta gösteriliyor.
- Seçimden sonra değiştirilen dil/kalite bekleyen işlere uygulanıyor. Tamamlanan geçmiş korunuyor. Okunamayan geçmiş dosyasının üzerine boş kuyruk yazılmıyor.
- Üst bölümdeki Ücretsiz/Sınırsız etiketi ve kullanılmayan stilleri kaldırıldı; logo, renkler, görseller ve genel düzen korundu.
- Resmî Windows Whisper çalıştırıcısının Türkçe karakterli mutlak model yolunda 0xC0000409 ile çökmesi gerçek testte bulundu. İş klasöründe özel model junction'ı ve ASCII göreli dosya adlarıyla çalıştırma düzeltmesi yapıldı; model kopyalanmıyor ve temizlikte hedef model korunuyor.
- Metin düzelticinin zaman damgaları ve ondalık sayılara hatalı boşluk eklemesi giderildi.
- Electron contextIsolation açık, nodeIntegration kapalı; ana pencere/frame/origin IPC kontrolleri ve dış gezinme engeli korunuyor.

## Model ve çevrimdışı bileşenler

Whisper Large-v2 q5_0, 1.080.732.091 bayt:
`3a214837221e4530dbc1fe8d734f302af393eb30bd0ed046042ebf4baf70f6f2`.

Önceki q5_k adı resmî kaynakta bulunmadığı için bütün akış aynı resmî Large-v2 q5_0 dosyasında birleştirildi. Small/medium modele geçilmedi.

Paket bileşenleri: whisper.cpp 1.9.2, ggml CPU DLL'leri, uygulama yanındaki Microsoft VC++ x64 runtime DLL'leri, FFmpeg/FFprobe n8.1.3 LGPL shared ve DLL'leri, yt-dlp 2026.08.19, Deno 2.9.7, model, sürüm/hash kayıtları ve üçüncü taraf lisansları. Geliştirici hazırlığı indirir; kurulu uygulama ilk açılışta model indirmez. Paketleme öncesi ve paket içindeki dosyalarda boyut/SHA256/sürüm doğrulaması yapılır.

## Çalıştırılan testler

- İlk `npm ci`: başarılı, 570 paket. Paketleme aracı düzeltmesinden sonraki son `npm ci`: başarılı, 474 paket; npm denetimi 9 orta, 10 yüksek, 2 kritik bulgu bildirdi. Kalan bağımlılık güvenlik yükseltmeleri ayrı bakım gerektiriyor.
- `npm run typecheck`, `npm run build`: başarılı.
- Son tam `npm run test:electron`: 20 başarılı / 0 atlanan. Ek odaklı çalıştırmada gerçek YouTube Dönüştür düğmesi, yeni kuyruk kaydı, tüm aşamalar ve sonuç ekranı da geçti. Kanıtlar: `build/electron-smoke/2026-10-18T13-05-14-218Z-8676/evidence.json` ve `build/electron-smoke/2026-10-18T13-09-17-468Z-19268/evidence.json`.
- `npm run tools:prepare`, `npm run tools:validate`: başarılı; 46 bileşen doğrulandı. Eksik manifest ve bozuk modelin paketleme öncesinde reddedilmesi test edildi.
- Gerçek Electron testinde disk üzerindeki File nesneleri CDP dispatchDragEvent ile bırakıldı: tek/çoklu MP3-WAV, Türkçe karakterli dosya yolu, sürükleme vurgusu, Dosya Seç ile eşdeğer metadata, geçersiz biçim uyarısı ve alan dışı bırakmada gezinmeme doğrulandı.
- Yerel gerçek MP3 oynatma, duraklatma, ilerleme, 10 saniye ileri/geri, ses seviyesi; geçerli token için HTTP206, bilinmeyen token404, geçersiz yöntem405 ve aralık416 kontrolleri geçti.
- Yerel gerçek Whisper transkripsiyonu ve sonuç/ilerleme ekranı; ayar/geçmiş koruma, bozuk geçmişin değiştirilmeden reddi, Kürtçe ayar taşıma, bekleyen işin dil/kalite değişimi testleri geçti.
- İngilizce Windows SAPI konuşması ile Türkçe ve Almanca gerçek FLEURS konuşmalarında zorunlu dil ve Otomatik testleri geçti; otomatik kodlar en/tr/de.
- Gerçek TXT ve DOCX içeriğinde ç/ğ/ı/İ/ö/ş/ü doğrulandı. PDF dosya yapısı, tamamlanma işareti ve gömülü TrueType font doğrulandı; PDF'nin her glifinin görsel çizimi ayrı ölçülmedi.
- Gerçek Whisper süreci iptal edildi; süreç/iş klasörü temizliği ve junction hedefi modelin korunması doğrulandı.
- NASA'nın [60 Years in 60 Seconds](https://www.youtube.com/watch?v=1UaBgr_sq9A) videosunda bilgi, gerçek ses indirme/MP3 önizleme, oynatıcı kontrolleri ve Large-v2 transkripsiyonu geçti. Kaynak önbelleğinin tekrar kullanıldığı ve bağlantı değişince eski bilginin temizlendiği doğrulandı.

FLEURS kaynakları: [Google FLEURS, CC-BY-4.0](https://huggingface.co/datasets/google/fleurs), [FluidInference WAV aynası](https://huggingface.co/datasets/FluidInference/fleurs-full). NASA erişim kaynağı: [NASA medya kullanım ilkeleri](https://www.nasa.gov/nasa-brand-center/images-and-media/). Medya dosyaları Git'e eklenmemiştir.

Testler gerçek kullanıcı verilerine dokunmadan build/electron-smoke altında ayrı userData ve Belgeler dizininde çalışır; evidence.json, home.png ve result.png dosyaları burada tutulur. Yerel testlerde Electron HTTP/HTTPS istekleri engellenmiştir; ana bilgisayarın bütün ağ bağlantısı fiziksel olarak kesilmemiştir.

## NSIS ve masaüstü çıktısı

`npm run dist` başarılı: NSIS x64 kurulum dosyası oluşturuldu ve Windows'un gerçek Masaüstü klasörüne kopyalandı. Son düzeltilmiş paketin boyutu: **1.320.056.507 bayt**. Build çıktısı ile masaüstü kopyasının SHA256 değerleri eşleşiyor:

```text
C11822963ACB7187A439B379D63675FAD9FA28EBFDB2C00CC9A2C52CCAFB2DC4
```

Yerel çıktı: `dist-electron-package/My-Sesi-Metne-Donusturme-Setup-x64.exe`. Tam masaüstü yolu ve hash ayrıca ignore edilen `build/setup-artifact.json` dosyasındadır.

**Yalıtılmış NSIS testinde 10/10 kontrol başarılı:** gerçek kurulum, masaüstü/Başlat menüsü kısayol hedefleri, kurulu 46 araç/model dosyasının SHA256 değerleri, 15 derlenmiş dosyanın kaynak build ile byte eşitliği, kurulu EXE açılışı, gerçek yerel transkripsiyon ve TXT/PDF/DOCX, daha geniş kurulu kaynak testi, kaldırma ve mevcut kullanıcı uygulamasının korunması.

Gerçek kurulu EXE'deki 5/5 doğrudan kontrol geçti; model Türkçeyi `tr` olarak algıladı. Renderer HTTP/HTTPS ve EXE DNS erişimi engellendi. TXT 401 bayt, PDF 28.429 bayt, DOCX 9.026 bayt üretildi; Unicode içerik doğrulandı. Teste ait dört çıktı güvenli biçimde temizlendi. Mevcut kullanıcının EXE/ASAR/ayar/geçmiş/kısayol/registry kontrolleri değişmedi; test uygulaması kaldırıldı.

Kanıtlar: `build/installer-smoke-tests/20261019-093300-fd013355/result.json` ve aynı klasörde `installed-launch.json`. Ek kurulu ASAR çevrimdışı testinde 11 kontrol geçti; YouTube ve çoklu dil seçenekleri burada amaçlı kapalıydı ve önceki tam 20/20 çalışmada doğrulanmıştı: `build/electron-smoke/2026-10-19T06-40-00-165Z-19528/evidence.json`.

Large-v2 modelinin 15 geçişli maksimum Deflate sıkıştırması uzun build süresine yol açtığından NSIS paket sıkıştırması normal düzeye alındı. Araç/model dosyalarının bütünlüğü boyut ve SHA256 ile doğrulanır.

Kurulu EXE testinde electron-builder 25.1.8'in `call-bind-apply-helpers` bağımlılığını yanlış alt klasöre paketlemesi yüzünden PDF'nin geliştirme ortamında çalışıp kurulumda bozulduğu bulundu. Paketleme aracı aynı NSIS altyapısıyla tam sürüm `26.17.0` olarak sabitlendi, `allowMissingDependencies: false` eklendi. Yeni afterPack kontrolü gerçek paketlenmiş EXE/ASAR içinden PDF ve DOCX üretir ve modüllerin geliştirme klasöründen bulunmasını reddeder; hata NSIS sıkıştırmasından önce yakalanır. Resmî hata kaydı: https://github.com/electron-userland/electron-builder/issues/8973.

Makinede aynı uygulama kimliğiyle eski sürüm kurulu olduğundan, test için farklı uygulama kimliği/GUID/EXE/kısayol adı kullanılır; mevcut sürümü kaldıran gerçek production yükseltmesi bu makinede uygulanmaz. Derlenmiş uygulama dosyaları ve Tools/model byte/hash eşitliği denetlenir. Test NSIS'i production kısayollarını temizleyen özel include dosyasını kullanmaz.

## Test kapsamı dışında kalanlar

- Fiziksel Dosya Gezgini fare hareketi elle yapılmadı; gerçek disk File nesneleriyle Chromium yerel bırakma yolu otomatik test edildi. Dosya Seç'in OS penceresi testte yanıtla değiştirildi; sonrası gerçek uygulama kodudur.
- Temiz Windows 10/11 VM ve fiziksel olarak bağlantısı kesilmiş bilgisayar mevcut değildi; bu koşullardaki kabul testi ayrıca gerekir.
- Modelin desteklemediği diller veya YouTube oturum/yaş/bölge kısıtlamalı içerikler için garanti verilmez.
- FFmpeg kaynak ağacı ve sabit derleme tarifleri build/third-party-sources altında hazırlandı. Tam bağımlılık kaynak arşivi kümesi için upstream Docker/bash indirme adımı gerekiyor. Dağıtıma/yayıma hazırlanırken LGPL kaynak sağlama koşulları [Tools/THIRD_PARTY_NOTICES.md](Tools/THIRD_PARTY_NOTICES.md) ve [Tools/ffmpeg-sources.json](Tools/ffmpeg-sources.json) üzerinden tamamlanmalıdır. GitHub Release yayımlanmadı.

## Değişen dosyalar

Aktif kaynaklar: src/main/main.ts; src/preload/preload.ts; src/renderer/App.tsx, types.ts, styles/app.css; yeni assets/flag-de.png.

Paketleme/test: package.json, package-lock.json; scripts/prepare-tools.ps1; scripts/electron-smoke.cjs; scripts/test-installer.ps1; scripts/installed-exe-smoke.cjs; scripts/validate-tools.cjs; scripts/validate-packaged-tools.cjs; scripts/copy-installer.cjs; scripts/prepare-third-party-sources.ps1.

Belgeler/bütünlük: README.md, TEST_NOTES.md, GITHUB_UPLOAD_COMMANDS.md; Tools/README.md, THIRD_PARTY_NOTICES.md, tools-lock.json, runtime-manifest.json, ffmpeg-sources.json, licenses/*; .gitignore, .gitattributes.

Whisper modeli, araç EXE/DLL'leri, Setup, test medyası ve build dizinleri normal Git geçmişine dahil edilmez.
