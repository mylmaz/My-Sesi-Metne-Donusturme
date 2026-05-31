# TEST_NOTES

Tarih: 2026-05-31

## Bu Oturumda Yapılan Kontroller

- Proje boş workspace içinde oluşturuldu.
- .NET Framework compiler bulundu: `C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe`
- `dotnet`, MSBuild ve Inno Setup bu makinede PATH üzerinde bulunamadı.
- `.\build.ps1` başarıyla çalıştı.
- Üretilen ana çıktı: `build\bin\MySesiMetneDonusturme.exe`
- Üretilen setup: `dist\MySesiMetneDonusturme_Setup_v1.0.0.exe`
- Masaüstü build klasörü oluşturuldu: `MySesiMetneDonusturme_Build`
- Uygulama gizli pencereyle kısa süre başlatıldı; startup crash görülmedi.
- Eksik araçlar için otomatik indirme akışı eklendi: yt-dlp, FFmpeg, whisper.cpp ve `ggml-base.bin`.
- Yüksek doğruluk varsayılan model yapıldı; seçili model dosyası yoksa işlem başlamadan indirme akışına yönlendirilir.
- Whisper çağrısına beam-search/best-of, Türkçe prompt, işlemci thread ayarı ve yüksek doğrulukta bağlam/sözcük bölme parametreleri eklendi.
- No-speech eşiği atlamayı azaltacak şekilde yükseltildi, `--carry-initial-prompt` eklendi.
- Yaygın Türkçe yazım hataları için temel otomatik düzeltme katmanı eklendi.
- `scripts\prepare-tools.ps1` ile FFmpeg, yt-dlp, whisper.cpp ve `ggml-small.bin` indirildi; yeni setup bu araçları içerir.
- DataGrid başlık/hücre stilleri koyu temada okunur olacak şekilde zorlandı.
- ComboBox açılır liste ve seçili öğe renkleri koyu temada okunur olacak şekilde zorlandı.
- Ana sayfa animasyonu statik başlık + ince parlayan çizgiye çevrildi; eski bar tipi AI ses dalgası kaldırılıp çizgisel waveform animasyonu eklendi.
- Ana sayfa AI/müzik görselli slider, animasyonlu ses dalgaları ve direkt erişim butonlarıyla yenilendi.
- Dosya yükleme üst alanı taşmayı önlemek için sarmal buton/seçenek düzenine çevrildi.
- Açık/koyu tema kaydedildiğinde arayüz yeniden uygulanacak şekilde düzeltildi.

## Senaryo Durumu

- Tek MP3 dosyası yükleme: UI ve kuyruk kodu hazır; gerçek dosya ile manuel test gerekir.
- Tek M4A dosyası yükleme: UI ve kuyruk kodu hazır; gerçek dosya ile manuel test gerekir.
- MP4 video dosyasından transkripsiyon: FFmpeg + Whisper araçları eklendikten sonra test edilmeli.
- Birden fazla dosyayı toplu işleme: kuyruk kodu hazır; gerçek dosyalarla manuel test gerekir.
- YouTube linkinden işlem başlatma: yt-dlp ve internet bağlantısı eklendikten sonra test edilmeli.
- PDF dışa aktarma: kod hazır; tamamlanmış metinle manuel test gerekir.
- Word dışa aktarma: kod hazır; tamamlanmış metinle manuel test gerekir.
- TXT dışa aktarma: kod hazır; tamamlanmış metinle manuel test gerekir.
- İşlem iptali: CancellationToken ve process kill desteği eklendi; uzun işlemle manuel test gerekir.
- Hatalı dosya formatı: desteklenmeyen uzantı uyarısı eklendi.
- İnternet olmayan durumda YouTube linki: kullanıcı dostu hata mesajı kodu eklendi; manuel test gerekir.

## Not

Gerçek transkripsiyon testleri bu oturumda tamamlanamadı, çünkü yüksek doğruluk modeli büyük dosya içeriyor ve manuel medya dosyası sağlanmadı. Uygulama artık seçili modeli işlem başlatırken resmi kaynaklardan indirecek şekilde yönlendirir. Dahili setup paketi oluşturuldu; yönetici izni gerektirdiği için gerçek kurulum çalıştırılmadı.
