# Electron sürümü için çevrimdışı araçlar

Geliştirme bilgisayarında `npm ci`, ardından `npm run tools:prepare` çalıştırın.
Bu adım internet kullanır. `tools-lock.json` içindeki sabit sürümleri indirir;
her indirmeyi SHA256 ile doğrular, gerekli DLL ve lisansları çıkarır. Kurulu
uygulama bu hazırlığı çalıştırmaz ve ilk açılışta model indirmez.

```text
Tools/
  ffmpeg/ffmpeg.exe, ffprobe.exe, *.dll
  whisper/whisper-cli.exe, whisper.dll, ggml*.dll, Microsoft runtime DLL'leri
  models/ggml-large-v2-q5_0.bin
  yt-dlp/yt-dlp.exe
  deno/deno.exe
  licenses/
  runtime-manifest.json
  tools-lock.json
  THIRD_PARTY_NOTICES.md
```

Model, resmi whisper.cpp model deposundaki **Whisper Large-v2 q5_0** dosyasıdır
(1.080.732.091 bayt; SHA256
`3a214837221e4530dbc1fe8d734f302af393eb30bd0ed046042ebf4baf70f6f2`).
Önceki paket tanımındaki `ggml-large-v2-q5_k.bin` resmi model dosyasıyla
eşleşmiyordu. Model ailesi Large-v2 olarak korunmuştur; daha küçük bir model
indirilmez. Hızlı, Dengeli ve Yüksek Doğruluk aynı modeli farklı çözümleme
parametreleriyle kullanır.

`npm run tools:validate` dosya boyutlarını, SHA256 değerlerini, zorunlu DLL'leri
ve çalıştırıcı sürümlerini kontrol eder. `npm run dist` bu kontrolü paketleme
öncesinde ve paket içindeki gerçek kopyalar üzerinde tekrar yapar; eksik veya
bozuk dosyada kurulum oluşturma durur. NSIS çıktısı tamamlandığında Windows'un
gerçek masaüstü klasörüne `My-Sesi-Metne-Donusturme-Setup-x64.exe` olarak
kopyalanır. Test kurulumunda `MY_TRANSCRIPT_SKIP_DESKTOP_COPY=1` kullanılabilir.

Araçların binary dosyaları, model ve indirme önbelleği normal Git geçmişine
eklenmemelidir. Kaynak/lisans ve yeniden dağıtım ayrıntıları
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) dosyasındadır. Son kullanıcı
kurulumdan sonra yerel medyayı çevrimdışı işleyebilir; YouTube için internet gerekir.

FFmpeg kaynaklarını ve sabit derleme tariflerini hazırlamak için
`powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/prepare-third-party-sources.ps1`
çalıştırın. Bağımlılık kaynaklarının tamamını indirmek için Docker ve bash bulunan
bir ortamda ayrıca `-IncludeDependencySources` kullanın. Bu kaynak hazırlığı,
yeniden dağıtım için ayrıca gereken karşılık gelen kaynak setini somutlaştırır;
Docker olmadan bütün kaynakların tamamlandığını varsaymayın.
