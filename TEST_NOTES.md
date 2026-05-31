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

Gerçek transkripsiyon testleri bu oturumda tamamlanamadı, çünkü workspace içinde FFmpeg, whisper.cpp binary/model dosyaları ve yt-dlp bulunmuyor. Uygulama bu eksikleri Ayarlar ekranında gösterir ve kullanıcıya anlaşılır uyarı verir. Dahili setup paketi oluşturuldu; yönetici izni gerektirdiği için gerçek kurulum çalıştırılmadı.
