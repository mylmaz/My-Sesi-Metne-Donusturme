# Kurulumdaki üçüncü taraf bileşenler

Bu uygulama aşağıdaki değiştirilmemiş üçüncü taraf programları ayrı süreçler
olarak çalıştırır. Lisansların tam metinleri `licenses/` klasöründedir.
Araçlar ve model ilk açılışta indirilmez; geliştirici hazırlığında doğrulanıp
NSIS paketine konur. Sabit sürümler, indirme adresleri ve SHA256 değerleri
`tools-lock.json`, paketlenmiş dosyaların SHA256 değerleri `runtime-manifest.json`
içindedir.

| Bileşen | Sürüm / lisans | Kaynak |
| --- | --- | --- |
| whisper.cpp | 1.9.2 / MIT | https://github.com/ggml-org/whisper.cpp/tree/v1.9.2 |
| Whisper Large-v2 q5_0 modeli | MIT | https://huggingface.co/ggerganov/whisper.cpp/tree/5359861c739e955e79d9a303bcbc70fb988958b1 |
| FFmpeg ve FFprobe | n8.1.3-18-g46d899d7a0 / LGPL v3 | https://github.com/FFmpeg/FFmpeg/tree/46d899d7a0 |
| FFmpeg Windows derleme betikleri | BtbN 63ac3265b0789ea16c7b1f8351cd2ad195a28722 | https://github.com/BtbN/FFmpeg-Builds/tree/63ac3265b0789ea16c7b1f8351cd2ad195a28722 |
| yt-dlp | 2026.08.19 / Unlicense, paket bağımlılıkları ayrı lisanslı | https://github.com/yt-dlp/yt-dlp/tree/2026.08.19 |
| Deno | 2.9.7 / MIT, V8 ve diğer bağımlılıkları ayrı lisanslı | https://github.com/denoland/deno/tree/v2.9.7 |
| Microsoft Visual C++ x64 çalışma zamanı | 14.44.35211.0 / Microsoft yeniden dağıtım koşulları | https://learn.microsoft.com/cpp/windows/redistributing-visual-cpp-files |

## FFmpeg kaynakları ve değiştirme hakkı

FFmpeg'in GPL veya nonfree sürümü kullanılmaz. `lgpl-shared` paketindeki LGPL v3
lisansı, programları ve libav DLL dosyaları birlikte dağıtılır. İlgili kütüphaneleri
uyumlu değiştirilmiş sürümlerle değiştirmek ve LGPL haklarını kullanmak serbesttir;
uygulama bu dosyalar için imza zorlaması veya değiştirmeyi önleyen bir kısıtlama koymaz.

Tam derleme yapılandırması `ffmpeg/ffmpeg.exe -buildconf` ile görülebilir. Yukarıdaki
FFmpeg kaynak ağacı ile sabitlenmiş BtbN kaynak ağacındaki `scripts.d`, `patches` ve
derleme betikleri, bu sürümün kaynaklarını ve bağımlılık kaynaklarının adreslerini
gösterir. Derleme komutu `./makeimage.sh win64 lgpl-shared 8.1`, ardından
`./build.sh win64 lgpl-shared 8.1` şeklindedir.

`powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/prepare-third-party-sources.ps1`
komutu, gerçek FFmpeg kaynak arşivini ve sabit BtbN tarif arşivini SHA256 ile
doğrulayarak `build/third-party-sources` altına hazırlar; 134 bağımlılık tarifinin
kaynak adresi/sürüm değişkenlerini `dependency-source-manifest.json` içine kaydeder.
Arşiv adresleri ve sağlama toplamları `Tools/ffmpeg-sources.json` içindedir.
Upstream'in `download.sh` betiği Docker üzerinde bağımlılıkların kaynak arşivlerini
`.cache/downloads` altına indirir; hazırlık betiğinin `-IncludeDependencySources`
seçeneği bunu çalıştırır. Bu ortamda Docker ve bash bulunmadığı için bağımlılık
kaynak arşivlerinin tamamı hazırlanmış değildir. Kaynak dosyaları ignore edilen
build dizinindedir; kurulumun içine konulduğu iddia edilmez.

Kurulumun yeniden dağıtımında LGPL v3 madde 6 uyarınca karşılık gelen kaynakların
aynı dağıtım yerinde sunulması veya geçerli bir kaynak sağlama düzenlemesi yapılması
gerekir. Yalnızca derleme tariflerinin bulunması, bütün bağımlılık kaynaklarının
sağlandığı anlamına gelmez. Bu repo bir GitHub Release yayımlamaz veya uygulama
sahibi adına kaynak sağlama taahhüdü vermez.

Microsoft DLL dosyaları resmi imzalı redistributable paketinden çıkarılır ve
whisper-cli.exe ile aynı klasöre konur. Windows genel çalışma zamanları değiştirilmez.
Yeniden dağıtım, Microsoft lisansındaki dağıtılabilir kod koşullarına tabidir.
