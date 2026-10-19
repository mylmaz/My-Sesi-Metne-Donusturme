# Whisper kalite ve konuşma kaybı doğrulaması

Bu çalışma iki somut uygulama sorununu giderir: yalnız sayılardan oluşan SRT konuşma satırlarının silinmesi ve karşıt fazlı stereo kanalların standart mono toplamada birbirini yok etmesi. Bütün kayıtlar için daha yüksek tanıma doğruluğu veya eksiksiz transkripsiyon garantisi verilmez. Denenen genel Whisper parametre değişikliği bazı örneklerde gerilediği için varsayılan yapılmamıştır.

## Kullanılan model ve mevcut ayarlar

- Model: **Whisper Large-v2 q5_0**, `ggml-large-v2-q5_0.bin`, **1.080.732.091 bayt**.
- SHA256: `3a214837221e4530dbc1fe8d734f302af393eb30bd0ed046042ebf4baf70f6f2`.
- Çalıştırıcı: **whisper.cpp 1.9.2**, paket içindeki Windows x64 CPU çalıştırıcısı.
- Karşılaştırma: **Dengeli**, beam size `6`, best-of `6`, bu makinede `8` iş parçacığı.
- Hızlı/Dengeli/Yüksek Doğruluk seçeneklerinin mevcut `4/6/8` beam eşlemeleri korunur. Bu rapor diğer iki mod için doğruluk karşılaştırması iddia etmez.
- `no_speech_thold=0.6`, sıcaklık ve `0.2` sıcaklık artışı upstream varsayılanlarında bırakılır. Ek VAD modeli, küçük model veya boşlukları tahmin ederek doldurma eklenmez.
- Otomatik dilde açık `-l auto` kullanılır; dil zorlayan başlangıç metni yoktur. Zorunlu dil seçimlerinin mevcut başlangıç metinleri korunur.
- FFmpeg zinciri mevcut 16 kHz, mono, `pcm_s16le` WAV ve `aresample=async=1:first_pts=0,loudnorm=I=-18:LRA=11:TP=-1.5` hazırlığını korur.
- Windows Unicode yolları için göreve özel model dizin bağlantısı ve göreli ASCII Whisper dosya argümanları korunur; model kopyalanmaz.

Gerçekte desteklenen seçenekler paketli `whisper-cli.exe --help` çıktısıyla kontrol edilmiştir. Açıklamalar [whisper.cpp 1.9.2 CLI kaynağı](https://github.com/ggml-org/whisper.cpp/blob/v1.9.2/examples/cli/cli.cpp) ve [Whisper transcribe uygulaması](https://github.com/openai/whisper/blob/v20250625/whisper/transcribe.py) ile karşılaştırılmıştır. Başlangıç metni bir tanıma bağlamıdır; önceki pencere bağlamını veya sessizlik eşiklerini değiştirmek farklı kayıtlarda farklı sonuçlar verebilir.

## Parametre karşılaştırması

İki profil aynı model, hazırlama zinciri ve beam değerleriyle **seri** çalıştırılmıştır:

1. `baseline`: uygulamanın mevcut zorunlu dil başlangıç metni ve `--carry-initial-prompt` seçeneği.
2. `no-prompt`: yalnız bu başlangıç metninin ve taşıma seçeneğinin çıkarıldığı aday.

Sekiz kayıt için toplam **16 gerçek native Whisper çalıştırması** tamamlanmıştır. Her satırdaki metin, argümanlar, zamanlı segmentler, işlem süresi ve düzenleme sayıları yerel JSON kanıtında bulunur.

| Kayıt | Kaynak süresi | Mevcut WER | Promptsuz aday WER | Sonuç |
| --- | ---: | ---: | ---: | --- |
| Açık İngilizce | 8,928 sn | %5,56 | %0,00 | Aday bu örnekte daha iyi |
| Açık Türkçe | 14,160 sn | %15,00 | %15,00 | Aynı |
| Açık Almanca | 17,940 sn | %0,00 | %11,11 | Aday daha kötü |
| Düşük sesli Türkçe, −36 dB | 14,160 sn | %15,00 | %15,00 | Aynı |
| Hızlandırılmış Türkçe, 1,6× | 8,869 sn | %20,00 | %20,00 | Aynı |
| Aralarında 14 sn sessizlik bulunan İngilizce tekrarlar | 45,856 sn | %0,00 | %0,00 | Aynı |
| İngilizce, altı tam cümle grubu ve ara sessizlikler | 67,068 sn | %0,00 | %0,00 | Aynı |
| NASA, bağımsız yükleyici altyazısı | 60,032 sn | %12,10 | %11,29 | Küçük örnek farkı |

**Karar:** promptsuz profil bütün dillere uygulanmamıştır. Almanca örnekteki gerileme, tek İngilizce örnekteki iyileşmenin genel bir ayar değişikliği için yeterli olmadığını gösterir. Whisper güven/sessizlik eşiklerinde ölçülmemiş değişiklik yapılmamıştır.

### Referanslar ve ölçüm sınırları

- Türkçe ve Almanca kayıtlar mevcut doğal konuşma örnekleridir. `*.trans.txt` dosyalarının yalnız ilgili ilk `*_0000` referans satırı kullanılır; bütün veri kümesinin metni tek kısa kayıtla karşılaştırılmaz.
- İngilizce `en_us.wav`, metni bilinen mevcut SAPI konuşmasıdır. Tekrarlar ve sessizlik eklemeleri kontrollü sentetik testtir; doğal uzun toplantı örneği olarak sunulmaz.
- Düşük ses ve hız örnekleri aynı doğal Türkçe kaydın FFmpeg ile dönüştürülmüş kopyalarıdır. Kaynağın konuşulan kelimeleri değiştirilmemiştir.
- NASA referansı, [resmî videonun](https://www.youtube.com/watch?v=1UaBgr_sq9A) ayrı yükleyici `subtitles.en` kanalından alınmıştır; `automatic_captions` kullanılmamıştır. Konuşmacı etiketleri ve müzik/tezahürat notları çıkarılır. Bu referans ayrıca insan tarafından yeniden dinlenip denetlenmiş değildir. Var olan Whisper çıktıları sonradan bu bağımsız referansla puanlanmış, yeniden inference yapılmamıştır.
- WER, büyük/küçük harf ve noktalama normalize edildikten sonraki sözcük ekleme/silme/değiştirme oranıdır. Bir hizalama silmesi tek başına gerçek akustik konuşma kaybının kanıtı değildir.
- Türkçe referanstaki `on yedi` ile tanınan `17` aynı sayıyı farklı biçimde yazar. Birincil tabloda bu fark sıkı ortografik hata olarak kalır. Yalnız bu bilinen sayı biçimini eşitleyen ikincil tanıda açık/düşük sesli Türkçe %5, hızlı Türkçe %10 WER verir. Bu ikinci değerler birincil sonuçların yerine geçirilmemiştir.
- Bilinen tekrar/pencere sınırları ile SRT segmentleri karşılaştırıldığında 16 çalıştırmada tamamen boş kalan beklenen konuşma penceresi bulunmamıştır. Bu ölçüm sözcük düzeyinde zorlanmış hizalama veya bağımsız kare düzeyi konuşma etiketi değildir; kelime hatalarının olmadığı anlamına gelmez.
- İşlem süreleri bu makinedeki tek çalıştırmalardır; istatistiksel performans veya başka bilgisayarlarda aynı hız garantisi değildir.

Doğal konuşma referanslarının birincil kaynağı [Google FLEURS veri kümesi ve CC-BY-4.0 lisans kaydı](https://huggingface.co/datasets/google/fleurs), araştırma açıklaması [FLEURS makalesidir](https://arxiv.org/abs/2205.12446). Kullanılan WAV dosyalarının erişim aynası [FluidInference/fleurs-full](https://huggingface.co/datasets/FluidInference/fleurs-full) kümesidir. NASA kaydı ve altyazı erişim bağlantısı yukarıdaki resmî video, ilgili kullanım koşulları ise [NASA medya kullanım ilkeleri](https://www.nasa.gov/nasa-brand-center/images-and-media/) sayfasıdır. Sesler, altyazı dosyaları ve kişisel dosya yolları kaynak depoya eklenmez; test kaynakları bu bağlantılarla belirtilir.

## Hazırlanan WAV dosyalarının kontrolü

16 karşılaştırmanın her birinde **gerçek hazırlanan dosya FFprobe ile yeniden incelenmiştir**:

- `sample_rate`: `16000`
- `channels`: `1`
- `codec_name`: `pcm_s16le`
- Kaynak ve hazırlanan WAV süreleri arasındaki en büyük mutlak fark: **0,000018 saniye**; örnekleme zaman tabanı yuvarlaması.

Bu örneklerde başlangıç/son kesilmesine işaret eden süre kaybı yoktur. Hazırlama komutunda `-ss`, `-t`, sessizlik kesme veya konuşma aralarını silme uygulanmaz. Süre kontrolü, bütün olası bozuk zaman damgalı dosyalar için evrensel doğrulama olarak sunulmaz.

## Sayısal konuşmanın ve zaman hassasiyetinin korunması

SRT sıra numarası yalnız zaman satırından önceki indekstir. Önceki okuyucu bütün rakam satırlarını indeks saydığından, zaman satırından sonra gerçekten söylenen `2026` veya `17` gibi bir konuşma satırını da kaldırabiliyordu.

Yeni okuyucu metni zaman satırından sonra alır; rakamları, özgün harfleri ve noktalama işaretlerini korur. `segments` alanındaki `start`/`end` değerlerinde gerçek SRT kesirli saniyeleri saklanır. Örneğin `00:00:01,230` değeri `1.23` olarak kalır; görünür eski `[00:00:01]` biçimi bu veriyi yok etmez. `rawTranscript` otomatik düzeltmeden önceki metni tutar. Otomatik düzeltme kapalıyken SRT okuma aşaması metni kendiliğinden düzeltmez.

Sayısal satırlar, çok satırlı metin, kesirli zaman, Türkçe/Almanca karakterler ve geçersiz zaman aralıkları doğrudan parser regresyon testleriyle denetlenir. Sonuç kaydı ve dışa aktarma sorunları ayrıca uygulamanın işlevsel testlerinde incelenir.

## Kurulu EXE ile 197 saniyelik kaydın ölçümü

NSIS ile kurulmuş **1.1.0 EXE**, 197,08 saniyelik kontrollü Türkçe kaydı gerçek arayüz akışından **Hızlı / Otomatik** ayarlarıyla işledi. Dil `tr` algılandı; özgün tamamlanmış sonuç 13 zamanlı segment içerdi. Değerlendirme, kurulu uygulama testinin `completed` alanında korunan bu gerçek model sonucuna uygulanmıştır. Sonradan çok sayfalı dışa aktarmayı zorlamak için oluşturulan tekrarlı test metni puanlamaya alınmamıştır; yeniden Whisper çalıştırılmamıştır.

| Ölçüm | Sonuç |
| --- | ---: |
| Kaynak süresi | 197,08 sn |
| Referans sözcük sayısı | 260 |
| Tanınan sözcük sayısı, sıkı ortografik biçim | 247 |
| Birincil WER | %15,00 |
| Birincil düzenlemeler | 26 değiştirme, 13 silme, 0 ekleme |
| Yalnız bilinen `17/on yedi` biçimi eşitlenmiş ikincil WER | %5,00 |
| İkincil düzenlemeler | 13 değiştirme, 0 silme, 0 ekleme |
| Tamamen boş kalan beklenen tekrar penceresi | 0 / 13 |

On üç cümlenin tamamı sonuçta bulunur. Sayının iki sözcük yerine `17` yazılması birincil sözcük hizalamasının hata sayısını artırır; sayı biçimi eşitlenince kalan fark her tekrardaki yer adı tanımasıdır. Bu kontrollü kayıt, aynı doğal cümlenin 13 tekrarından oluşur; farklı konuşmacıları veya bağımsız üç dakikalık doğal konuşmayı temsil etmez. Segmentlerin beklenen pencereyle örtüşmesi, tek tek bütün sözcüklerin veya akustik konuşma karelerinin eksiksiz tanındığını kanıtlamaz. Bu sonuç genel bir tanıma iyileşmesi karşılaştırması olarak sunulmaz.

Kurulu EXE testinde gerçek transkripsiyon ve üç farklı zaman düğmesinden ses konumuna gitme kontrolleri geçti. Aynı test çalıştırması daha sonraki `Page.captureScreenshot` adımında zaman aşımına uğradı; **bu kanıttan bütün kurulum/arayüz/dışa aktarma kabul testinin geçtiği sonucu çıkarılmamıştır**. Bu sonraki kabul adımları tamamlanmamıştır; yukarıdaki özgün model sonucu ve kalite ölçümü geçerlidir. Kanıt: `build/installer-smoke-tests/20261019-144851-0c89ff97/installed-launch.json`; puanlama: aynı klasördeki `quality-score.json`.

## Karşıt fazlı stereo için sınırlı koruma

Doğal Türkçe kayıttan oluşturulan kontrollü `L=s`, `R=−s` stereo örneğinde her kanalın RMS değeri **−24,860928 dBFS**, mono ortalamanın RMS değeri **−∞** ölçülmüştür. Yani konuşma her iki kanalda mevcutken standart toplama onu sıfıra indirir; sonradan loudnorm bu kaybı geri getiremez.

Uygulama yalnız iki kanallı stereo için önce dosyanın tamamının kanal ve `(L+R)/2` enerjisini ölçer. Sıradan iki kanallı PCM WAV dosyaları kanal düzeni alanını belirtmeyebildiğinden, FFmpeg'in mevcut L/R varsayımıyla uyumlu olarak `stereo`, belirtilmemiş veya `unknown` düzen kabul edilir; açıkça belirtilmiş farklı düzenler bu istisnanın dışındadır.

Kanal seçimi yalnız şu koşulların **tamamında** uygulanır:

- Kanalların normalize çapraz korelasyonu en fazla `−0.999`.
- Mono ortalamada güçlü kanala göre en az **30 dB** enerji kaybı: kanal enerjisinin %99,9'dan fazlası toplamda kayboluyor.
- Güçlü kanalda RMS en az **−60 dBFS**; salt çok düşük seviyeli gürültü için kanal değiştirilmez.

Bu durumda daha yüksek enerjili kanal seçilir; ardından mevcut mono/16 kHz/loudnorm zinciri aynen uygulanır. Her zaman sol kanal seçilmez. Analiz tamamlanamazsa normal hazırlama korunur. Analiz süreçleri de mevcut işlem iptaline bağlıdır.

| Kontrollü gerçek ses testi | Ölçülen davranış |
| --- | --- |
| Aynı fazlı iki kanal | Koruma uygulanmadı; eski/yeni hazırlanan WAV SHA256 değerleri aynı |
| Karşıt fazlı eşit kanallar | Güçlü kanal üzerinden gerçek konuşma korundu |
| Sağ kanalı daha güçlü karşıt faz | Sağ kanal seçildi |
| Sırayla sol Türkçe / sağ Almanca konuşma | Koruma uygulanmadı; eski/yeni hazırlanan WAV SHA256 değerleri aynı, iki konuşma da normal karışımda kaldı |

Karşıt fazlı Türkçe dosyanın mevcut hazırlamasıyla Whisper alakasız metin üretmiş ve **%100 WER** vermiştir. Korunan hazırlamayla gerçek cümle geri gelmiş ve **%15 WER** elde edilmiştir; bu, aynı açık Türkçe örneğin mevcut model sonucuyla aynıdır. Bilinen `17/on yedi` sayı biçimi eşitlenirse ikincil değer %5'tir.

Ek gerçek Electron testinde aynı karşıt fazlı dosya **uygulamanın main/preload/IPC transkripsiyon yolu** üzerinden işlendi. FFprobe yalnız `channels: 2` döndürdü; kanal düzeni alanı yoktu. Ana süreç günlüğünde kanal `0`, korelasyon `−1` ve kanal RMS değerleri `−24,860928 dBFS` ile korumanın gerçekten devreye girdiği doğrulandı. Sonuç `Tamamlandı`, gerçek Türkçe konuşma, kesirli saniyeli `segments` ve otomatik TXT üretildi. Bu ek entegrasyon testi **Hızlı** modda çalışmıştır; yukarıdaki %15 WER karşılaştırması ise Dengeli profilinin ayrı native ölçümüdür. Kanıt: `build/phase2/stereo-guard-2026-10-19T11-42-49-380Z/evidence.json` (`actualMainPipeline: true`).

Bu, ölçülen stereo toplama hatasının düzeltilmesidir; modelin genel tanıma doğruluğunun aynı oranda arttığı iddiası değildir. Bütün karmaşık, fazı zamanla değişen veya kanallarda farklı içerikler bulunan kayıtlar için genellenmiş kanıt bulunmaz. Normal ve sırayla konuşmalı kontrol kayıtlarının değişmediği ayrıca doğrulanmıştır.

## Yeniden çalıştırma ve kanıtlar

```powershell
npm run build
node --test scripts/transcription.test.cjs
node scripts/benchmark-whisper.cjs
node scripts/benchmark-stereo.cjs
```

Varsayılan karşılaştırma `baseline,no-prompt` profillerini seri çalıştırır. Tekrar inference yapmadan mevcut çıktıları FFprobe ve bağımsız altyazıyla puanlamak için:

```powershell
node scripts/benchmark-whisper.cjs --rescore=build/whisper-benchmarks/2026-10-19T09-10-15-149Z/report.json
node scripts/score-existing-transcript.cjs build/installer-smoke-tests/20261019-144851-0c89ff97/installed-launch.json
```

Yerel ayrıntılı kanıtlar ve örnek sesler `.gitignore` kapsamındaki `build` klasöründe tutulur; büyük modeller veya ses kayıtları normal Git geçmişine eklenmez:

- Ana karşılaştırma: `build/whisper-benchmarks/2026-10-19T09-10-15-149Z/report.json` ve her testin `process.log`, `transcript.srt`, `result.json` dosyaları.
- Stereo kontrolü: `build/whisper-benchmarks/stereo-2026-10-19T11-34-58-314Z/report.json` ve gerçek FFmpeg analiz günlükleri.
- Zaman tıklama testi için hazırlanan uzun örnek: `build/real-media-tests/quality-fixtures/fixtures/long-tr-180.wav`, **197,08 saniye**. Doğal Türkçe örnek 13 kez, birer saniyelik ara ile birleştirilmiştir; yeni bir doğal üç dakikalık konuşma olarak sunulmaz. Referans, bilinen tekrar sınırları ve hash aynı klasördeki `manifest.json` dosyasındadır. Bu dosya varsayılan 16 çalıştırmalı kalite tablosuna dahil değildir.
