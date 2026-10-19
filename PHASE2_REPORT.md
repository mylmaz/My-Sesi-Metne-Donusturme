# 1.1.0 — İkinci aşama düzeltme ve doğrulama raporu

Tarih: 19 Ekim 2026. Bu rapor aktif Electron uygulamasını kapsar; eski C#/WPF kaynakları değiştirilmemiştir. Mevcut renkler, logo, görseller ve cam efektli tasarım korunmuştur. Üyelik, ödeme, abonelik veya giriş sistemi eklenmemiştir.

**Teslim durumu:** Kaynak kod düzeltmeleri, aşağıda kanıtı verilen testler ve model içeren **1.1.0 NSIS Setup** tamamlandı. Ayrı test kimliğinde kurulum/yükseltme/kaldırma, yeni kurulu EXE'de gerçek transkripsiyon ve üç zaman damgası kontrolü geçti. Kurulu EXE'nin yerel Kaydet pencereleriyle üç formatta dışa aktarma ve gerçek süreç yeniden başlatma/geçmiş kabul testi **tamamlanmadı**. Kullanıcının GitHub'a hemen gönderme talebi üzerine uzun testler durduruldu; eksik adımlar başarılı sayılmadan kaynaklar ve bu rapor teslim edilir. Commit/push sonucu teslim mesajında ayrıca bildirilir.

## Ortam ve sürümler

| Bileşen | Doğrulanan sürüm |
| --- | --- |
| İşletim sistemi | Windows 11 Pro, build 26300 |
| Uygulama | 1.1.0 |
| Electron | 34.5.8 |
| React | 18.3.1 |
| TypeScript | 5.9.3 |
| Vite | 6.4.3 |
| electron-builder / kurulum | 26.17.0 / NSIS x64 |
| DOCX | docx 9.7.1 |
| PDF | PDFKit 0.15.2 |

Mevcut kullanıcıya ait gerçek 1.0.0 kurulumu korunur; production kimliğiyle üzerine kurulum yapılmaz. Yalıtılmış test kurulumunun uygulama kimliği, GUID'si, EXE ve kısayol adı farklıdır. Aynı derlenmiş uygulama dosyaları ve Tools/model dosyaları byte/hash karşılaştırmasıyla denetlenir.

## Yedi somut sorun ve uygulanan değişiklikler

| Sorun / doğrulanan neden | Yapılan değişiklik | Başlıca dosyalar |
| --- | --- | --- |
| Kuyruk sütunlarının ve oynatıcı alt öğelerinin sabit asgari genişlikleri dar pencerede taşabiliyordu. Uzun aktif dosya adı paneli gereksiz büyütüyor, kısa pencerede mutlak konumlu sidebar görseli/footer navigasyonla çakışabiliyordu. Önceki 1280×760 DIP pencere alt sınırı da 1280×720 fiziksel ekranın %125 ölçeğine sığmıyordu. | Kuyruk kapsayıcısına göre tablo/kart düzeni, sarılan düğmeler, daralabilen sütunlar ve kompakt oynatıcı düzeni eklendi. Aktif ad iki satırda kesilir; tamamı tooltip'te kalır. Kısa görünümde yalnız dekoratif sidebar görseli gizlenir; çok kısa dikey sidebar kaydırılır ve footer doğal akışa geçer. Pencere alt sınırı 960×520 DIP oldu. | `src/renderer/App.tsx`, `src/renderer/styles/app.css`, `src/main/main.ts` |
| Ham ilerleme değerleri ekranda uzun ondalıklar/geçersiz değerler gösterebiliyor; 99,999 gibi bir değer erken 100'e yuvarlanabiliyordu. Geç gelen bir olay tamamlanmış işi yeniden işleniyor yapabiliyordu. | Etiket ve çubuk aynı sonlu, sınırlı değeri kullanır. Türkçe biçim `87,04%`; aktif işler en fazla `99,99%`, yalnız kesin tamamlanmış sonuç `100%` gösterir. Geç olaylar yalnız hâlen işlenen kayıtları günceller; son durumu transkripsiyon yanıtı belirler. | `src/renderer/presentation.ts`, `src/renderer/App.tsx`, `src/main/main.ts` |
| Mevcut kurulu 1.0.0 akışı kullanıcıya kayıt yeri sormadan sabit Belgeler çıktı klasörüne yazıyordu. Düğmenin dosya üretmesi, kullanıcının konumu seçebilmesiyle aynı şey değildi. Otomatik TXT yazma hatası geçerli transkripti de başarısız sayabiliyordu. | TXT/PDF/DOCX için ana pencereye bağlı gerçek Windows Kaydet penceresi açılır. İptal sessizdir; başarı bildirimi seçilen yolu içerir, gerçek hata Türkçe gösterilir ve günlüğe yazılır. Çıktı aynı klasörde geçici dosyaya hazırlanıp doğrulandıktan sonra hedefe taşınır; önceki hedef baştan silinmez. PDF hataları IPC'yi reddeder, Windows Türkçe fontu gömülür, sayfalamayı PDFKit yapar. Otomatik TXT hatasında hazır sonuç korunur ve başka konum seçme uyarısı gösterilir. | `src/main/main.ts`, `src/renderer/App.tsx`, `src/renderer/types.ts` |
| SRT okuyucusu yalnız rakamlardan oluşan bütün satırları sıra numarası sayıyor; gerçekten söylenen `2026` veya `17` gibi metinleri silebiliyordu. Görünen saniye biçimi milisaniyeleri de kaybediyordu. | Sıra numarası ve konuşma metni zaman satırına göre ayrılır. Sayılar, harfler ve noktalama korunur; gerçek `start/end` değerleri isteğe bağlı `segments` alanına kaydedilir. `rawTranscript` otomatik düzeltmeden önceki gerçek metindir. | `src/main/transcription.ts`, `src/main/main.ts`, `src/renderer/types.ts` |
| Ölçülen karşıt fazlı stereo örneğinde iki kanalda var olan konuşma standart mono toplamada birbirini tamamen yok ediyordu. Model eşiğini değiştirmek bu ses hazırlama kaybını gidermez. | Yalnız ağır ve ölçülmüş faz iptalinde daha güçlü kanal seçilir. Normal ve sırayla kanallarda konuşma bulunan örnekler mevcut mono zincirini kullanmaya devam eder. Aynı Large-v2 modeli ve mevcut kalite/sessizlik eşikleri korunur. | `src/main/audio-preparation.ts`, `src/main/main.ts` |
| Sonuç zaman damgaları düz metindi; oynatıcıya seek isteği gönderilmiyordu. YouTube önizlemesi henüz hazırlanmadığında doğrudan konum değiştirmek de yeterli değildi. | Geçerli zaman damgaları düğmedir. Gerçek segment hassasiyeti varsa kullanılır, eski kayıtlar görünür zamandan ayrıştırılır. Ses gerektiğinde hazırlanır, metadata gelince gerçek süreye sınırlı seek uygulanır. Yerel/YouTube kaynak değişimi ve eski asenkron yanıtlar denetlenir; durmuş ses kendiliğinden çalmaz. | `src/renderer/App.tsx`, `src/renderer/presentation.ts` |
| Geçmiş satırında açık bir sonuç görüntüleme eylemi yoktu; bazı eski kayıtlarda metin yalnız `rawTranscript` içindeydi. Rerun kopyası eski segment/çıktı alanlarını taşıyabiliyor, doğrudan JSON yazımı yarıda kalırsa dosyayı kesebiliyordu. | `Sonucu Görüntüle` ve `Geçmişe Dön` eklendi. Eski raw metin aynen açılır; baştan beri metni olmayan kayıtta düğme kapalıdır ve neden açıklanır. Yeniden dönüştürme güncel dil/kaliteyle yeni, temiz bir kayıt oluşturur. Geçmiş/ayarlar geçici dosya ardından atomik değiştirilir; okuma/yazma hatası görünürdür. | `src/main/main.ts`, `src/renderer/App.tsx`, `src/renderer/presentation.ts` |

Bu aşamada mevcut kurulumun `app.asar` dosyası ayrıca incelendi: yerel Kaydet penceresi akışı yoktu; önceki aşamada sorun çıkaran `call-bind-apply-helpers` modülü ise mevcut paket içindeydi. Dolayısıyla geçmişteki paketleme bağımlılığı hatasının bu aşamadaki kayıt yeri sorununa yeniden neden olduğu iddia edilmez. Paket içi PDF/DOCX bağımlılık doğrulamaları korunur. Preload'un mevcut `exportFile` aktarımı kullanılmaya devam eder; güvenlik ayarları gevşetilmemiştir.

## Tamamlanan testler

| Kontrol | Sonuç ve kapsam |
| --- | --- |
| `npm ci`, `npm run typecheck`, `npm run build` | Başarılı bağımlılık kurulumu, kaynak kontrolü ve production derlemesi. Gönderim öncesi TypeScript ve 9 birim testi yeniden geçti. Son NSIS çıktısının sonucu aşağıdadır. |
| `npm run test:unit` | **9 başarılı:** yüzde/seek/timestamp/rerun için 4; SRT/metin için 3; stereo kararları için 2 test. |
| Tam kaynak Electron testi | **21 başarılı, 0 atlanan.** Gerçek yerel transkripsiyon, sonuç/ilerleme, üç dışa aktarma, iptal, ayar/geçmiş, TR/DE/EN, gerçek YouTube indirme/önizleme/kontroller/dönüştür düğmesi ve üç YouTube timestamp konumu dahil. Kanıt: `build/electron-smoke/2026-10-19T11-36-58-392Z-14292/evidence.json`. Geliştirme testinde Kaydet penceresinin cevabı test yolu ile belirlenir; bu sonuç gerçek Windows penceresinin otomasyonu olarak sunulmaz. |
| Responsive görünüm | **30 düzen durumu başarılı:** 1920×1080, 1704×900, 1600×900, 1366×768, 1280×720; %100/%125 karşılığı Chromium viewport ölçüleri; 0/1/6 uzun adlı kayıt. Etiketler, hücre/kontrol çakışmaları ve yatay taşma denetlendi; ekran görüntüleri alındı. Kanıt: `build/phase2/layout-2026-10-19T11-31-04-591Z/evidence.json`. |
| Son iki görsel düzeltmenin odaklı tekrarı | **6 durum ve eski kayıt senaryosu başarılı.** 1366×768/%100 ve 1280×720/%125; aktif adın iki satırı, kompakt oynatıcı ve dekoratif görselin kısa yükseklikte gizlenmesi görsel olarak da incelendi. Kanıt: `build/phase2/layout-2026-10-19T11-35-12-402Z/evidence.json`. Bunlar global Windows ölçeği değiştirilmiş fiziksel ekran testleri değildir. |
| Gerçek pencere ve son küçük yükseklik düzeltmesi | **Başarılı:** ana bilgisayarın gerçek %125/120 DPI ölçeğinde pencere fiziksel olarak 1920×1080, 1704×900, 1600×900, 1366×768, 1280×720 ve ayrıca 1280×650 boyutlarına getirildi. Sonuncunun gerçek istemci alanı 1010×483 DIP idi; sidebar/footer erişimi ve çakışmama doğrulandı. Ayrıca 1024×490 dahil 9 odaklı kuyruk durumu kontrol edildi. Kanıt: `build/phase2/layout-2026-10-19T11-47-18-898Z/evidence.json`. Global Windows ölçeği değiştirilmedi; %100 karşılığı ayrı emülasyon testindedir. |
| Eski geçmiş uyumluluğu | Seed edilmiş raw-only kayıt aynen açıldı; yalnız durum içeren/metinsiz kayıtta sonuç düğmesi kapalı kaldı. Kullanıcının mevcut geçmişi bu makinede boş olduğundan gerçek eski kullanıcı transkriptleri üzerinde taşıma yapıldığı iddia edilmez. |
| Gerçek main stereo entegrasyonu | **Başarılı.** Karşıt fazlı gerçek ses main/preload/IPC yolundan geçti; kanal koruması günlüğe yansıdı, Türkçe metin, hassas segmentler ve otomatik TXT oluştu. Bu entegrasyon Hızlı modda çalıştı. Kanıt: `build/phase2/stereo-guard-2026-10-19T11-42-49-380Z/evidence.json`. |
| Kalite karşılaştırması | **16 gerçek native Whisper çalıştırması + karşıt faz için 2 ek native çalışma** tamamlandı. Normal stereo ve sırayla kanallarda konuşma kontrolleri de incelendi. Profiller, referanslar, WER ve sınırlar [WHISPER_QUALITY_REPORT.md](WHISPER_QUALITY_REPORT.md) içindedir. Karşıt faz örneğinde mevcut hazırlamanın %100 WER sonucu korunan hazırlamada %15 oldu; bu tek örnek bütün kayıtlar için doğruluk artışı değildir. |
| Windows dışa aktarma dosya güvenliği | Geçerli mevcut dosyanın üzerine yazma; kasıtlı pre-rename hatasında mevcut hedefin korunması ve kendi geçici dosyasının temizlenmesi; gerçek PDF imzası; gerçek `ENOENT` stream hatasının reddi geçti. Kanıt: `build/phase2/export-review/evidence.json`. Kasıtlı hata tam disk oluşturma testi değildir. |

Otomatik TXT hata akışı ayrıca **gerçek 9 saniyelik Whisper transkripsiyonuyla** doğrulandı: yalnız testin otomatik TXT hedefi için `renameSync` aşamasında simüle edilmiş `EACCES` üretildi. Metin, ham çıktı ve segmentler `Tamamlandı` durumunda kaldı; Türkçe uyarı geldi, geçici dosyalar temizlendi. Hata enjeksiyonu kaldırılınca normal export IPC'si ve test kayıt penceresi cevabıyla ayrı Unicode dosya yoluna metnin tamamı kaydedildi. **2 kontrol geçti.** Bu test gerçek NTFS ACL değiştirme veya dolu disk testi değildir. Kanıt: `build/phase2/export-failure-2026-10-19T11-53-36-442Z-17396/evidence.json`.

## Model ve paket bileşenleri

Whisper **Large-v2 q5_0**, `Tools/models/ggml-large-v2-q5_0.bin`, **1.080.732.091 bayt** korunur. SHA256:

```text
3a214837221e4530dbc1fe8d734f302af393eb30bd0ed046042ebf4baf70f6f2
```

Whisper.cpp 1.9.2 ve CPU DLL'leri, uygulama yanındaki VC++ x64 runtime DLL'leri, FFmpeg/FFprobe n8.1.3 LGPL shared ve DLL'leri, yt-dlp 2026.08.19, Deno 2.9.7, model ve lisans/bütünlük kayıtları mevcut paket tanımında korunur. Hızlı/Dengeli/Yüksek Doğruluk aynı modeli kullanır; beam değerleri 4/6/8'dir. Yeni model indirme ekranı veya küçük modele geçiş eklenmemiştir. Nihai 1.1.0 paketinin 46 araç/model dosyası ile kurulu test uygulamasının kaynak/model hash denetimleri geçti.

## Değişen dosyalar

- Uygulama: `src/main/main.ts`, yeni `src/main/transcription.ts`, yeni `src/main/audio-preparation.ts`; `src/renderer/App.tsx`, `src/renderer/types.ts`, `src/renderer/styles/app.css`, yeni `src/renderer/presentation.ts`.
- Regresyon/kalite: `src/renderer/presentation.test.cjs`, `scripts/transcription.test.cjs`, `scripts/benchmark-whisper.cjs`, `scripts/benchmark-stereo.cjs`, `scripts/score-existing-transcript.cjs`, `scripts/stereo-guard-smoke.cjs`, `scripts/export-failure-smoke.cjs`.
- UI/kurulum doğrulaması: `scripts/electron-smoke.cjs`, `scripts/installed-exe-smoke.cjs`, `scripts/test-installer.ps1`, `scripts/native-save-dialog.ps1`, `scripts/native-window-bounds.ps1`, `scripts/ui-layout-smoke.cjs`, `scripts/ui-regression.cjs`.
- Sürüm ve belgeler: `package.json`, `package-lock.json`, `README.md`, `TEST_NOTES.md`, `GITHUB_UPLOAD_COMMANDS.md`, `WHISPER_QUALITY_REPORT.md`, bu rapor.

Model, EXE/DLL, Setup, test medyası, yerel kanıtlar ve kişisel tam dosya yolları normal Git geçmişine eklenmez.

## Setup ve kurulu EXE kabul sonuçları

| Adım | Bu rapor hazırlanırken durum |
| --- | --- |
| Nihai `npm run dist`, 1.1.0 NSIS x64 Setup ve paket bütünlüğü | **Başarılı.** 46 araç/model dosyasının hash kontrolü ve gerçek paket EXE/ASAR içinden 254 bağımlılıkla PDF/DOCX üretimi geçti. |
| Gerçek yeni kurulu EXE'de UI üzerinden transkripsiyon ve timestamp | **Geçti:** 197,08 saniyelik kontrollü Türkçe kayıt, otomatik `tr` algılama, 13 segment ve üç farklı zaman damgasıyla seek. Kanıt: `build/installer-smoke-tests/20261019-144851-0c89ff97/installed-launch.json`. WER ayrıntısı kalite raporundadır. |
| Gerçek yeni kurulu EXE'de TXT/PDF/DOCX yerel Kaydet pencereleri, iptal, çok sayfalı PDF tam metin/Türkçe karakter ve DOCX içeriği | **Tamamlanmadı.** İlk uçtan uca çalışma ekran görüntüsü zaman aşımıyla, ikincisi görünürlük önkoşulunda durdu; bu çalışmaların genel sonucu `failed` durumundadır. Kaynak/paket içi dosya üretim testleri geçti; bunlar tam yerel pencere kabulü yerine sunulmaz. |
| Paketli EXE'de gerçek Windows pencere yeniden boyutlandırması | **30 görünüm ve 6 gerçek boyut kontrolü geçti.** Ayrı paketli EXE probe'u, yalnız test başlatıcısına verilen Chromium arka plan/occlusion parametreleriyle çalıştı. Probe sonraki adımda test etiketinin kodlama hatasıyla durdu; genel kabul sonucu başarılı değildir. Kanıt: `build/phase2/packaged-visibility-1792428217426/evidence.json`. Üretim uygulaması veya Windows ekran ölçeği değiştirilmedi. |
| Gerçek süreç kapanıp açıldıktan sonra geçmiş sonucu; kaynak medya yokken metni açma ve dışa aktarma | **Tamamlanmadı.** Kaynak testindeki kayıt/açma ve eski raw-only uyumluluk kontrolleri geçti; tam kurulu EXE yeniden başlatma kabulüne ulaşılmadı. |
| Ayrı fixture kimliğinde doğrulanmış 1.0.0 → 1.1.0 yükseltme, ayar/geçmiş koruma, kaldırma ve production kurulumunun değişmediği denetimi | **Bu bağımsız kontroller geçti:** yükseltme öncesi/sonrası ayar ve geçmiş byte/hash eşitliği, kısayollar, model/araçlar, kaldırma, yalnız teste ait profil temizliği ve production dosya/ayar/kısayol/registry koruması. Kanıt: `build/installer-smoke-tests/20261019-144851-0c89ff97/result.json` ve `20261019-193510-799b20e4/result.json`. İkisinin de genel UI kabul sonucu yukarıdaki nedenlerle `failed`; gerçek kullanıcının 1.0.0 kurulumu korunmuştur. |
| Masaüstü Setup | **Başarılı.** Gerçek Windows `DesktopDirectory` klasörüne `My-Sesi-Metne-Donusturme-Setup-x64.exe` kopyalandı. Sürüm **1.1.0**, boyut **1.320.062.417 bayt**, SHA256 **B581C3705A3CD250B36EC29A8552B100BF56D3D60A6C497958E293C617D9BC17**. Build ve masaüstü kopyasının hash'leri eşit; önceki 1.0.0 paketinden farklı. Tam yerel yol ve doğrulama zamanı `build/setup-artifact.json` içindedir. |
| GitHub commit/push | Hedef [mylmaz/My-Sesi-Metne-Donusturme](https://github.com/mylmaz/My-Sesi-Metne-Donusturme), dal `main`. İlgili kaynak/test/belgeler normal commit ve push kapsamındadır; kesin commit kimliği ve remote eşitliği teslim mesajında bildirilir. Model/Setup normal Git geçmişine eklenmez; GitHub Release yayımlanmaz. |

## Kapsam sınırları

- Temiz Windows 10/11 VM mevcut değildir. Test ana bilgisayarı Windows 11'dir; Windows 10 temiz kurulum kabulü ayrıca gerekir.
- Yerel testlerde uygulamanın HTTP/HTTPS ve gerektiğinde DNS erişimi engellenir; bütün ana bilgisayarın fiziksel internet bağlantısı kesilmez. YouTube testleri internet kullanır.
- Windows'un global %100/%125 ekran ölçeği ayarı değiştirilmemiştir. Chromium viewport emülasyonu ve gerçek pencere boyutlandırma ayrı yöntemler olarak raporlanır.
- Microsoft Word kurulu değildir. DOCX doğrulaması ZIP/XML içeriği üzerinden yapılır; Word uygulamasında açma testi olarak sunulmaz.
- Kalite ölçümleri sınırlı doğal konuşma, bilinen SAPI metni ve açıkça işaretlenen dönüştürülmüş/tekrarlı örneklerdir. Yeni bir doğal uzun toplantı kaydı veya tüm konuşmayı eksiksiz tanıma garantisi değildir.
- Üç timestamp konumu testi için hazırlanan 197,08 saniyelik örnek, doğal Türkçe kaydın 13 kez birer saniye arayla birleştirilmesidir. Ek tanınmış doğal konuşma gibi sunulmaz; kurulu EXE transkripsiyonu ve üç seek kontrolü geçti, sonraki tam kabul adımları tamamlanmadı.
- Üçüncü taraf lisans/kaynak sağlama koşulları önceki raporda ve `Tools/THIRD_PARTY_NOTICES.md` içinde geçerliliğini korur. Bu aşamada GitHub Release yayımlanmamıştır.
